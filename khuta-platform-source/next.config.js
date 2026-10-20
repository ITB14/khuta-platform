/** @type {import('next').NextConfig} */
module.exports = {
  // We serve our own SVG marks and self-hosted fonts; Next's image optimiser
  // is not used, so its native `sharp` dependency (and its libvips CVEs)
  // has no business in this build.
  images: { unoptimized: true },
  // The container copies .next/standalone, which carries only the modules the
  // server actually loads — a smaller image and a smaller attack surface.
  output: 'standalone',
  // The lesson files are a mounted volume, not part of the build. Without this
  // the tracer follows the media route's path check and copies them in.
  outputFileTracingExcludes: { '*': ['media/**'] },
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
