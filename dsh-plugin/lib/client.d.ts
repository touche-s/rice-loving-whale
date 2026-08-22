/**
 * dsh-maid-whale-pet client 插件类型声明
 */
export interface PetStateInfo {
  source: string;
  sessionId?: string;
  event?: string;
  toolName?: string;
  reason?: string;
  message?: string;
  prev?: string;
  at?: number;
}

export interface MaidWhalePetClientPlugin {
  apply(ctx: any): void;
  inject: string[];
  name: string;
}

declare const plugin: MaidWhalePetClientPlugin;
export default plugin;
