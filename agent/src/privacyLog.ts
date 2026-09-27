export type AgentLogEvent={event:'clipboard image detected'}|{event:'scan started'}|{event:'scan completed';findingCount:number;attentionRequired:boolean;durationMs:number}|{event:'notification displayed'}|{event:'scan failed';errorCategory:string};
export type AgentLogger=(entry:AgentLogEvent)=>void;
export const developmentLogger:AgentLogger=entry=>{if(import.meta.env.DEV)console.info('[SafeShare Agent]',entry);};
