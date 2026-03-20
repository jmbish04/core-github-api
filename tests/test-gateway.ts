
function mockEnv() {
  return {
    AI: {
      gateway: (name: string) => ({
        getUrl: async (provider?: string) => `https://gateway.ai.cloudflare.com/v1/mock-account/${name}${provider ? '/' + provider : ''}`
      })
    }
  }
}
async function test() {
  const e = mockEnv();
  console.log(await e.AI.gateway("test-gateway").getUrl());
}
test()
