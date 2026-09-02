import{descriptor}from"./presets-core.ts";import type{ProviderDescriptor}from"./types.ts"
export const STANDARD_PROVIDER_PRESETS:ProviderDescriptor[]=[
 descriptor({id:"xai-api",name:"xAI API",vendor:"xAI",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.x.ai/v1",source:"https://docs.x.ai/docs/api-reference"}),
 descriptor({id:"groq-api",name:"Groq API",vendor:"Groq",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.groq.com/openai/v1",source:"https://console.groq.com/docs/api-reference"}),
 descriptor({id:"mistral-api",name:"Mistral API",vendor:"Mistral AI",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.mistral.ai/v1",source:"https://docs.mistral.ai/api/"}),
 descriptor({id:"cerebras-api",name:"Cerebras API",vendor:"Cerebras",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.cerebras.ai/v1",source:"https://inference-docs.cerebras.ai/api-reference"}),
 descriptor({id:"together-api",name:"Together AI",vendor:"Together AI",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.together.xyz/v1",source:"https://docs.together.ai/reference"}),
 descriptor({id:"fireworks-api",name:"Fireworks AI",vendor:"Fireworks AI",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.fireworks.ai/inference/v1",source:"https://docs.fireworks.ai/api-reference/introduction"}),
 descriptor({id:"siliconflow-api",name:"SiliconFlow",vendor:"SiliconFlow",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.siliconflow.com/v1",source:"https://docs.siliconflow.com/en/api-reference"}),
 descriptor({id:"moonshot-payg",name:"Moonshot PAYG",vendor:"Moonshot AI",category:"api",transport:"openai-chat",billing:"payg",url:"https://api.moonshot.ai/v1",source:"https://platform.moonshot.ai/docs"}),
 descriptor({id:"huggingface-inference",name:"Hugging Face Inference",vendor:"Hugging Face",category:"api",transport:"openai-chat",billing:"payg",url:"https://router.huggingface.co/v1",source:"https://huggingface.co/docs/inference-providers"}),
]
