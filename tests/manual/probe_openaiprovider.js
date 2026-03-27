const { OpenAIProvider } = require('@openai/agents-openai');
console.log(OpenAIProvider.constructor.toString());
console.log("-------");
console.log(Object.keys(require('@openai/agents-openai')));
