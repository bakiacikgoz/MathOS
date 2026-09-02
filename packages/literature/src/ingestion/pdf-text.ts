export function extractPdfText(text:string){return text.split("\f").map((value,index)=>({text:value,locator:{kind:"PAGE" as const,pageStart:index+1}})).filter(page=>page.text.trim())}
