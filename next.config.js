/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    'imapflow',
    'mailparser',
    '@whiskeysockets/baileys',
    'pino',
    'qrcode',
  ],
};

module.exports = nextConfig;
