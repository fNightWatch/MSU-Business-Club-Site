/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/', destination: '/index.html' },
      { source: '/events', destination: '/events.html' },
      { source: '/forums', destination: '/forums.html' }
    ];
  }
};

export default nextConfig;
