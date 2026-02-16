#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import hashlib
import json
import logging
import os
import random
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup


MOSCOW_TZ = ZoneInfo("Europe/Moscow")

RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}

EVENT_HINT_HASHTAGS = ("#анонс", "#ивенты", "#дайджест")
EVENT_HINT_WORDS = (
    "регистрация", "дата", "время", "место", "встреча", "лекция",
    "мастер-класс", "воркшоп", "open talk", "ивент", "событ"
)


# ---------- модели ----------

@dataclass
class TelegramPost:
    channel: str
    post_id: int
    post_url: str
    published_at: Optional[datetime]
    text: str
    # список (href, anchor_text)
    links: List[Tuple[str, str]]


@dataclass
class Event:
    channel: str
    source_post_id: int
    source_post_url: str
    published_at: Optional[str]  # iso
    title: str
    start_at: Optional[str]      # iso
    location: Optional[str]
    registration_url: Optional[str]
    raw_text: str


# ---------- утилиты ----------

def now_iso() -> str:
    return datetime.now(tz=MOSCOW_TZ).isoformat()

def clean_text(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8", errors="ignore")).hexdigest()

def atomic_write_json(path: str, payload: dict) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)

def is_eventish_post(text: str) -> bool:
    low = (text or "").lower()
    if any(tag in low for tag in EVENT_HINT_HASHTAGS):
        return True
    if any(w in low for w in EVENT_HINT_WORDS):
        return True
    return False

def pick_title(text: str) -> str:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return (lines[0] if lines else "Событие")[:200]

def pick_location(text: str) -> Optional[str]:
    for ln in (text or "").splitlines():
        m = re.search(r"(?i)\bместо\b\s*[:\-]\s*(.+)$", ln.strip())
        if m:
            return m.group(1).strip()
    return None

def choose_registration_url(links: List[Tuple[str, str]]) -> Optional[str]:
    # Сначала внешние, потом любые
    for href, _ in links:
        if "t.me/" in href or href.startswith("tg://"):
            continue
        return href
    return links[0][0] if links else None

def parse_ru_datetime_from_text(text: str, base: Optional[datetime]) -> Optional[datetime]:
    """
    Best-effort: выдёргиваем первую встреченную дату/время из текста.
    Поддерживает:
      - 09.12.2025 ... 18:30
      - 09.12 ... 18:30
      - 4 декабря, 18:00 (+ год опционально)
    Если год не указан — base.year (или текущий).
    """
    base = base or datetime.now(tz=MOSCOW_TZ)
    low = (text or "").lower()

    # dd.mm.yyyy
    m = re.search(r"(\d{1,2})[./](\d{1,2})[./](\d{2,4})", low)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        hh, mm = 0, 0
        tm = re.search(r"(\d{1,2}):(\d{2})", low[m.end(): m.end() + 80])
        if tm:
            hh, mm = int(tm.group(1)), int(tm.group(2))
        return datetime(y, mo, d, hh, mm, tzinfo=MOSCOW_TZ)

    # dd.mm (без года)
    m = re.search(r"(\d{1,2})[./](\d{1,2})(?![./]\d)", low)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y = base.year
        hh, mm = 0, 0
        tm = re.search(r"(\d{1,2}):(\d{2})", low[m.end(): m.end() + 80])
        if tm:
            hh, mm = int(tm.group(1)), int(tm.group(2))
        candidate = datetime(y, mo, d, hh, mm, tzinfo=MOSCOW_TZ)
        if candidate < (base - timedelta(days=7)):
            candidate = datetime(y + 1, mo, d, hh, mm, tzinfo=MOSCOW_TZ)
        return candidate

    # "4 декабря (2025) ... 18:00"
    m = re.search(
        r"(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?",
        low,
    )
    if m:
        d = int(m.group(1))
        mo = RU_MONTHS.get(m.group(2), 0)
        y = int(m.group(3)) if m.group(3) else base.year
        hh, mm = 0, 0
        tm = re.search(r"(\d{1,2}):(\d{2})", low[m.end(): m.end() + 100])
        if tm:
            hh, mm = int(tm.group(1)), int(tm.group(2))
        candidate = datetime(y, mo, d, hh, mm, tzinfo=MOSCOW_TZ)
        if not m.group(3) and candidate < (base - timedelta(days=7)):
            candidate = datetime(y + 1, mo, d, hh, mm, tzinfo=MOSCOW_TZ)
        return candidate

    return None

def event_key(e: Event) -> str:
    base = f"{e.channel}|{e.source_post_id}|{e.title.strip()}|{e.start_at or ''}|{e.registration_url or ''}"
    return sha1(base)


# ---------- сеть (ретраи/429/бэкофф) ----------

def get_with_retries(
    session: requests.Session,
    url: str,
    timeout: int = 30,
    max_tries: int = 6,
    base_sleep: float = 1.0,
    max_sleep: float = 60.0,
) -> requests.Response:
    last_exc: Optional[Exception] = None

    for attempt in range(1, max_tries + 1):
        try:
            resp = session.get(url, timeout=timeout)
            # 429 — слишком часто
            if resp.status_code == 429:
                ra = resp.headers.get("Retry-After")
                if ra and ra.isdigit():
                    sleep_s = min(max_sleep, max(base_sleep, float(ra)))
                else:
                    sleep_s = min(max_sleep, base_sleep * (2 ** (attempt - 1)))
                sleep_s *= (0.85 + random.random() * 0.4)  # jitter
                logging.warning("429 Too Many Requests: sleep %.1fs url=%s", sleep_s, url)
                time.sleep(sleep_s)
                continue

            # временные серверные
            if 500 <= resp.status_code < 600:
                sleep_s = min(max_sleep, base_sleep * (2 ** (attempt - 1)))
                sleep_s *= (0.85 + random.random() * 0.4)
                logging.warning("HTTP %s: retry in %.1fs url=%s", resp.status_code, sleep_s, url)
                time.sleep(sleep_s)
                continue

            resp.raise_for_status()
            return resp

        except (requests.Timeout, requests.ConnectionError) as e:
            last_exc = e
            sleep_s = min(max_sleep, base_sleep * (2 ** (attempt - 1)))
            sleep_s *= (0.85 + random.random() * 0.4)
            logging.warning("Network error: %s | retry in %.1fs url=%s", e, sleep_s, url)
            time.sleep(sleep_s)
            continue
        except requests.HTTPError as e:
            # 404/403 и т.п. — обычно не лечится ретраями
            last_exc = e
            raise

    raise RuntimeError(f"Failed after {max_tries} tries: {url}") from last_exc


# ---------- парсинг HTML ----------

def parse_posts_from_html(html: str, channel: str) -> List[TelegramPost]:
    soup = BeautifulSoup(html, "html.parser")
    posts: List[TelegramPost] = []

    # Более устойчиво: div.tgme_widget_message[data-post="channel/123"]
    for msg in soup.select("div.tgme_widget_message"):
        data_post = msg.get("data-post")
        if not data_post or "/" not in data_post:
            continue
        try:
            ch, pid_s = data_post.split("/", 1)
            post_id = int(pid_s)
        except Exception:
            continue
        post_url = f"https://t.me/{data_post}"

        published_at = None
        time_tag = msg.select_one("a.tgme_widget_message_date time")
        if time_tag and time_tag.get("datetime"):
            dt_raw = time_tag["datetime"].replace("Z", "+00:00")
            try:
                published_at = datetime.fromisoformat(dt_raw)
            except Exception:
                published_at = None

        text_div = msg.select_one("div.tgme_widget_message_text")
        text = clean_text(text_div.get_text("\n") if text_div else "")

        links: List[Tuple[str, str]] = []
        if text_div:
            for a in text_div.select("a[href]"):
                href = (a.get("href") or "").strip()
                if not href:
                    continue
                anchor = clean_text(a.get_text(" ", strip=True)) or href
                links.append((href, anchor))

        # de-dup by href preserving order
        seen = set()
        uniq = []
        for href, anchor in links:
            if href in seen:
                continue
            uniq.append((href, anchor))
            seen.add(href)

        posts.append(
            TelegramPost(
                channel=channel,
                post_id=post_id,
                post_url=post_url,
                published_at=published_at,
                text=text,
                links=uniq,
            )
        )

    posts.sort(key=lambda p: p.post_id, reverse=True)
    return posts


# ---------- извлечение событий из поста ----------

def extract_events_from_post(post: TelegramPost) -> List[Event]:
    text = post.text or ""
    low = text.lower()

    # Дайджест (best-effort)
    is_digest = ("регистрация на события" in low) and (len(post.links) >= 2) and ("#дайджест" in low)

    events: List[Event] = []
    if is_digest:
        for href, anchor in post.links:
            if "t.me/" in href or href.startswith("tg://"):
                continue
            title = anchor
            if not title or title == href or title.lower().startswith("http"):
                title = "Событие из дайджеста"
            events.append(
                Event(
                    channel=post.channel,
                    source_post_id=post.post_id,
                    source_post_url=post.post_url,
                    published_at=post.published_at.isoformat() if post.published_at else None,
                    title=title[:200],
                    start_at=None,
                    location=None,
                    registration_url=href,
                    raw_text=text,
                )
            )
        return events

    # Один анонс
    title = pick_title(text)
    location = pick_location(text)
    start_dt = parse_ru_datetime_from_text(text, post.published_at)
    reg_url = choose_registration_url(post.links)

    events.append(
        Event(
            channel=post.channel,
            source_post_id=post.post_id,
            source_post_url=post.post_url,
            published_at=post.published_at.isoformat() if post.published_at else None,
            title=title,
            start_at=start_dt.isoformat() if start_dt else None,
            location=location,
            registration_url=reg_url,
            raw_text=text,
        )
    )
    return events


# ---------- хранилище прогресса (SQLite) ----------

def db_connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def db_init(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS posts(
            channel TEXT NOT NULL,
            post_id INTEGER NOT NULL,
            post_url TEXT NOT NULL,
            published_at TEXT,
            text TEXT,
            links_json TEXT,
            text_hash TEXT,
            scraped_at TEXT,
            PRIMARY KEY(channel, post_id)
        );

        CREATE TABLE IF NOT EXISTS events(
            channel TEXT NOT NULL,
            event_key TEXT PRIMARY KEY,
            source_post_id INTEGER NOT NULL,
            source_post_url TEXT NOT NULL,
            published_at TEXT,
            title TEXT NOT NULL,
            start_at TEXT,
            location TEXT,
            registration_url TEXT,
            raw_text TEXT,
            created_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_channel_post ON events(channel, source_post_id);

        CREATE TABLE IF NOT EXISTS missing_posts(
            channel TEXT NOT NULL,
            post_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            tries INTEGER NOT NULL DEFAULT 0,
            last_checked_at TEXT,
            note TEXT,
            PRIMARY KEY(channel, post_id)
        );
        """
    )
    conn.commit()

def db_existing_post_ids(conn: sqlite3.Connection, channel: str, ids: List[int]) -> set:
    if not ids:
        return set()
    q = f"SELECT post_id FROM posts WHERE channel=? AND post_id IN ({','.join(['?']*len(ids))})"
    rows = conn.execute(q, [channel, *ids]).fetchall()
    return {r[0] for r in rows}

def db_insert_post(conn: sqlite3.Connection, post: TelegramPost) -> bool:
    links_json = json.dumps([{"href": h, "text": t} for h, t in post.links], ensure_ascii=False)
    text_hash = sha1(post.text or "")
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO posts(channel, post_id, post_url, published_at, text, links_json, text_hash, scraped_at)
        VALUES(?,?,?,?,?,?,?,?)
        """,
        (
            post.channel,
            post.post_id,
            post.post_url,
            post.published_at.isoformat() if post.published_at else None,
            post.text,
            links_json,
            text_hash,
            now_iso(),
        ),
    )
    conn.commit()
    return cur.rowcount == 1

def db_insert_event(conn: sqlite3.Connection, ev: Event) -> bool:
    ek = event_key(ev)
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO events(
            channel, event_key, source_post_id, source_post_url, published_at,
            title, start_at, location, registration_url, raw_text, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            ev.channel,
            ek,
            ev.source_post_id,
            ev.source_post_url,
            ev.published_at,
            ev.title,
            ev.start_at,
            ev.location,
            ev.registration_url,
            ev.raw_text,
            now_iso(),
        ),
    )
    conn.commit()
    return cur.rowcount == 1

def db_mark_missing(conn: sqlite3.Connection, channel: str, post_id: int, status: str, note: str = "") -> None:
    conn.execute(
        """
        INSERT INTO missing_posts(channel, post_id, status, tries, last_checked_at, note)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(channel, post_id) DO UPDATE SET
            status=excluded.status,
            tries=missing_posts.tries + 1,
            last_checked_at=excluded.last_checked_at,
            note=excluded.note
        """,
        (channel, post_id, status, 1, now_iso(), note),
    )
    conn.commit()

def db_min_max_post_id(conn: sqlite3.Connection, channel: str) -> Tuple[Optional[int], Optional[int]]:
    row = conn.execute(
        "SELECT MIN(post_id), MAX(post_id) FROM posts WHERE channel=?",
        (channel,),
    ).fetchone()
    return row[0], row[1]

def db_missing_ids_in_range(conn: sqlite3.Connection, channel: str, start_id: int, end_id: int, limit: int) -> List[int]:
    """
    Возвращает id, которых нет в posts в пределах [start_id, end_id],
    исключая те, что уже помечены missing_posts.status='not_found' (чтобы не долбить удалённые).
    """
    # Для больших диапазонов этот запрос может быть тяжёлым, поэтому диапазон лучше держать умеренным.
    # Мы делаем "генерацию" диапазона на Python, но ограничиваем limit.
    existing = conn.execute(
        "SELECT post_id FROM posts WHERE channel=? AND post_id BETWEEN ? AND ?",
        (channel, start_id, end_id),
    ).fetchall()
    existing_set = {r[0] for r in existing}

    nf = conn.execute(
        "SELECT post_id FROM missing_posts WHERE channel=? AND status='not_found' AND post_id BETWEEN ? AND ?",
        (channel, start_id, end_id),
    ).fetchall()
    not_found_set = {r[0] for r in nf}

    missing = []
    for pid in range(start_id, end_id + 1):
        if pid in existing_set or pid in not_found_set:
            continue
        missing.append(pid)
        if len(missing) >= limit:
            break
    return missing

def export_events_json(conn: sqlite3.Connection, channel: str, out_path: str) -> int:
    rows = conn.execute(
        """
        SELECT channel, source_post_id, source_post_url, published_at, title, start_at, location, registration_url, raw_text
        FROM events
        WHERE channel=?
        ORDER BY COALESCE(start_at, ''), COALESCE(published_at, ''), source_post_id
        """,
        (channel,),
    ).fetchall()

    events = []
    for r in rows:
        events.append(
            {
                "channel": r[0],
                "source_post_id": r[1],
                "source_post_url": r[2],
                "published_at": r[3],
                "title": r[4],
                "start_at": r[5],
                "location": r[6],
                "registration_url": r[7],
                "raw_text": r[8],
            }
        )

    payload = {
        "channel": channel,
        "events_count": len(events),
        "generated_at": now_iso(),
        "events": events,
    }
    atomic_write_json(out_path, payload)
    return len(events)


# ---------- режимы скачивания ----------

def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (compatible; tg-events-parser/2.0; +https://t.me)",
            "Accept-Language": "ru,en;q=0.8",
        }
    )
    return s

def fetch_feed_page(session: requests.Session, channel: str, before: Optional[int]) -> str:
    base = f"https://t.me/s/{channel}"
    url = base if before is None else f"{base}?before={before}"
    resp = get_with_retries(session, url=url)
    return resp.text

def fetch_single_post(session: requests.Session, channel: str, post_id: int) -> str:
    # Страница конкретного поста (публичная)
    url = f"https://t.me/{channel}/{post_id}"
    resp = get_with_retries(session, url=url)
    return resp.text

def append_jsonl(path: str, obj: dict) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())


def run_update_mode(
    conn: sqlite3.Connection,
    channel: str,
    max_pages: int,
    max_posts: int,
    stop_after_known: int,
    sleep_sec: float,
    checkpoint_every: int,
    export_path: Optional[str],
    checkpoint_path: Optional[str],
    events_jsonl: Optional[str],
) -> None:
    session = make_session()

    before = None
    pages = 0
    processed_posts = 0
    inserted_posts = 0
    inserted_events = 0
    known_streak = 0

    def do_checkpoint():
        nonlocal export_path, checkpoint_path
        if checkpoint_path:
            atomic_write_json(
                checkpoint_path,
                {
                    "channel": channel,
                    "mode": "update",
                    "before": before,
                    "pages": pages,
                    "processed_posts": processed_posts,
                    "inserted_posts": inserted_posts,
                    "inserted_events": inserted_events,
                    "known_streak": known_streak,
                    "updated_at": now_iso(),
                },
            )
        if export_path:
            cnt = export_events_json(conn, channel, export_path)
            logging.info("Checkpoint export: %s events -> %s", cnt, export_path)

    while pages < max_pages and processed_posts < max_posts:
        try:
            html = fetch_feed_page(session, channel, before=before)
        except Exception as e:
            logging.exception("Failed to fetch feed page (before=%s): %s", before, e)
            do_checkpoint()
            return

        posts = parse_posts_from_html(html, channel)
        if not posts:
            logging.info("No posts found on page, stopping.")
            do_checkpoint()
            return

        pages += 1

        ids = [p.post_id for p in posts]
        existing = db_existing_post_ids(conn, channel, ids)

        # Новые -> старые
        for p in posts:
            if processed_posts >= max_posts:
                break

            processed_posts += 1

            if p.post_id in existing:
                known_streak += 1
                # если долго подряд встречаем уже известные, значит догнали “хвост”
                if known_streak >= stop_after_known:
                    logging.info("Stop condition reached: %d known posts in a row.", known_streak)
                    do_checkpoint()
                    return
                continue

            # Это новый пост
            known_streak = 0

            try:
                if db_insert_post(conn, p):
                    inserted_posts += 1

                if is_eventish_post(p.text):
                    for ev in extract_events_from_post(p):
                        if db_insert_event(conn, ev):
                            inserted_events += 1
                            if events_jsonl:
                                append_jsonl(events_jsonl, ev.__dict__)

            except Exception as e:
                logging.exception("Error processing post %s: %s", p.post_url, e)
                # продолжаем, прогресс в БД уже частично сохранён
                pass

            if checkpoint_every > 0 and (inserted_posts + inserted_events) % checkpoint_every == 0:
                do_checkpoint()

        # pagination
        min_id = min(p.post_id for p in posts)
        if before == min_id:
            logging.info("Pagination stuck (before repeats), stopping.")
            do_checkpoint()
            return
        before = min_id

        time.sleep(sleep_sec)

    do_checkpoint()


def run_fetch_ids_mode(
    conn: sqlite3.Connection,
    channel: str,
    ids: List[int],
    sleep_sec: float,
    export_path: Optional[str],
    events_jsonl: Optional[str],
) -> None:
    session = make_session()

    for i, pid in enumerate(ids, 1):
        # если уже есть — не трогаем
        if db_existing_post_ids(conn, channel, [pid]):
            logging.info("[%d/%d] post_id=%d already in DB, skip", i, len(ids), pid)
            continue

        try:
            html = fetch_single_post(session, channel, pid)
            posts = parse_posts_from_html(html, channel)
            # На странице конкретного поста обычно будет ровно 1
            post = None
            for p in posts:
                if p.post_id == pid:
                    post = p
                    break

            if not post:
                # Может быть удалён или недоступен, но сервер вернул страницу без контента
                db_mark_missing(conn, channel, pid, status="not_found", note="No tgme_widget_message for this id")
                logging.warning("post_id=%d not parsed (maybe deleted)", pid)
                continue

            db_insert_post(conn, post)

            if is_eventish_post(post.text):
                for ev in extract_events_from_post(post):
                    if db_insert_event(conn, ev) and events_jsonl:
                        append_jsonl(events_jsonl, ev.__dict__)

            logging.info("[%d/%d] OK post_id=%d", i, len(ids), pid)

        except requests.HTTPError as e:
            code = getattr(e.response, "status_code", None)
            if code == 404:
                db_mark_missing(conn, channel, pid, status="not_found", note="HTTP 404")
            elif code == 403:
                db_mark_missing(conn, channel, pid, status="forbidden", note="HTTP 403")
            else:
                db_mark_missing(conn, channel, pid, status="http_error", note=f"HTTP {code}")
            logging.warning("post_id=%d HTTP error: %s", pid, e)

        except Exception as e:
            db_mark_missing(conn, channel, pid, status="error", note=str(e)[:200])
            logging.exception("post_id=%d failed: %s", pid, e)

        time.sleep(sleep_sec)

    if export_path:
        cnt = export_events_json(conn, channel, export_path)
        logging.info("Exported %d events -> %s", cnt, export_path)


def run_repair_missing_mode(
    conn: sqlite3.Connection,
    channel: str,
    limit: int,
    sleep_sec: float,
    export_path: Optional[str],
    events_jsonl: Optional[str],
) -> None:
    mn, mx = db_min_max_post_id(conn, channel)
    if mn is None or mx is None:
        logging.warning("DB has no posts yet, repair_missing makes no sense. Run update first.")
        return

    missing = db_missing_ids_in_range(conn, channel, start_id=mn, end_id=mx, limit=limit)
    if not missing:
        logging.info("No missing ids detected in [%d..%d]", mn, mx)
        return

    logging.info("Repair missing: will fetch %d ids in range [%d..%d]", len(missing), mn, mx)
    run_fetch_ids_mode(conn, channel, missing, sleep_sec=sleep_sec, export_path=export_path, events_jsonl=events_jsonl)


# ---------- main ----------

def parse_ids_list(s: str) -> List[int]:
    out = []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        out.append(int(part))
    # unique preserve order
    seen = set()
    uniq = []
    for x in out:
        if x in seen:
            continue
        uniq.append(x)
        seen.add(x)
    return uniq


def main():
    ap = argparse.ArgumentParser(description="Telegram public channel events parser (with SQLite progress + checkpoints)")
    ap.add_argument("--channel", default="bcmsu", help="username канала без @")
    ap.add_argument("--db", default="tg_events.sqlite", help="SQLite файл прогресса")
    ap.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    ap.add_argument("--sleep", type=float, default=1.4, help="пауза между запросами (сек)")

    # update mode
    ap.add_argument("--max-pages", type=int, default=12, help="лимит страниц ленты (1 запрос = 1 страница)")
    ap.add_argument("--max-posts", type=int, default=250, help="лимит постов на запуск")
    ap.add_argument("--stop-after-known", type=int, default=25, help="остановиться после N подряд уже известных постов")

    # checkpoints & export
    ap.add_argument("--export", default="events.json", help="куда экспортировать полный JSON (перезапись атомарно)")
    ap.add_argument("--checkpoint-file", default="checkpoint.json", help="файл с прогрессом (атомарно)")
    ap.add_argument("--checkpoint-every", type=int, default=40, help="делать чекпоинт каждые N вставок (posts+events)")
    ap.add_argument("--events-jsonl", default=None, help="если задано — писать новые события построчно (JSONL)")

    # targeted fetch/repair
    ap.add_argument("--fetch-ids", default=None, help="скачать точечно только эти id, например: 123,124,130")
    ap.add_argument("--repair-missing", action="store_true", help="добрать отсутствующие id в диапазоне уже сохранённых")
    ap.add_argument("--repair-limit", type=int, default=120, help="сколько id максимум пытаться добрать за запуск")

    args = ap.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    conn = db_connect(args.db)
    db_init(conn)

    # Важно: экспорт можно отключить, если не нужен
    export_path = args.export if args.export else None
    checkpoint_path = args.checkpoint_file if args.checkpoint_file else None

    try:
        if args.fetch_ids:
            ids = parse_ids_list(args.fetch_ids)
            run_fetch_ids_mode(
                conn, args.channel, ids,
                sleep_sec=args.sleep,
                export_path=export_path,
                events_jsonl=args.events_jsonl,
            )
            return

        if args.repair_missing:
            run_repair_missing_mode(
                conn, args.channel,
                limit=args.repair_limit,
                sleep_sec=args.sleep,
                export_path=export_path,
                events_jsonl=args.events_jsonl,
            )
            return

        # default: update
        run_update_mode(
            conn=conn,
            channel=args.channel,
            max_pages=args.max_pages,
            max_posts=args.max_posts,
            stop_after_known=args.stop_after_known,
            sleep_sec=args.sleep,
            checkpoint_every=args.checkpoint_every,
            export_path=export_path,
            checkpoint_path=checkpoint_path,
            events_jsonl=args.events_jsonl,
        )

    except KeyboardInterrupt:
        logging.warning("Interrupted by user. Exporting checkpoint...")
        if export_path:
            export_events_json(conn, args.channel, export_path)
        if checkpoint_path:
            atomic_write_json(checkpoint_path, {"channel": args.channel, "interrupted_at": now_iso()})
        sys.exit(0)

    except Exception as e:
        # Максимально стараемся не терять прогресс
        logging.exception("Fatal error: %s", e)
        if export_path:
            try:
                export_events_json(conn, args.channel, export_path)
            except Exception:
                logging.exception("Export after fatal error failed.")
        if checkpoint_path:
            try:
                atomic_write_json(checkpoint_path, {"channel": args.channel, "fatal_at": now_iso(), "error": str(e)})
            except Exception:
                pass
        # обычный ненулевой код
        sys.exit(1)


if __name__ == "__main__":
    main()
