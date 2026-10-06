const nextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/business-english.html", destination: "/", permanent: true }];
  }
};

export default nextConfig;
