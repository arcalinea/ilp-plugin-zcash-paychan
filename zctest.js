function getHost(name) {
  return process.env.CI === 'true' ? name : '127.0.0.1';
}

console.log("CI", process.env.PORT)
