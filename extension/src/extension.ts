import * as vscode from 'vscode';

interface StateConfig {
  file: string;
  label: string;
  text: string;
  animation: string;
}

const STATES: Record<string, StateConfig> = {
  idle: {
    file: 'maid-whale-idle.jpg',
    label: '待机中',
    text: 'Zzz… 鲸鱼娘正在云朵上睡觉~',
    animation: 'float'
  },
  thinking: {
    file: 'maid-whale-thinking.jpg',
    label: '思考中',
    text: '嗯… 这个问题让我想想…',
    animation: 'tilt'
  },
  coding: {
    file: 'maid-whale-coding.jpg',
    label: '正在写代码',
    text: '噼里啪啦！代码写起来！',
    animation: 'type'
  },
  success: {
    file: 'maid-whale-success.jpg',
    label: '完成任务',
    text: '写完啦！奖励一大碗白米饭！',
    animation: 'bounce'
  },
  error: {
    file: 'maid-whale-error.jpg',
    label: '遇到报错',
    text: '呜哇！编译报错了，救救我…',
    animation: 'shake'
  }
};

const STATE_KEYS = Object.keys(STATES);

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MaidWhaleViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MaidWhaleViewProvider.viewType, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekMaidWhale.openPanel', () => {
      provider.showPanel(context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekMaidWhale.setState', async (state?: string) => {
      const normalized = state && STATE_KEYS.includes(state) ? state : await pickState();
      if (normalized) {
        provider.setState(normalized);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('deepseekMaidWhale.toggleAutoCycle', () => {
      provider.toggleAutoCycle();
    })
  );
}

async function pickState(): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    STATE_KEYS.map((key) => ({
      label: STATES[key].label,
      description: key
    })),
    { placeHolder: '选择鲸鱼娘状态' }
  );
  return picked?.description;
}

class MaidWhaleViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'deepseekMaidWhale.petView';

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private autoTimer?: NodeJS.Timeout;
  private autoEnabled = false;
  private currentState = 'idle';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  showPanel(extensionUri: vscode.Uri): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'deepseekMaidWhale.petPanel',
      '蓝色女仆鲸鱼娘',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  setState(state: string): void {
    if (!STATE_KEYS.includes(state)) {
      return;
    }
    this.currentState = state;
    this.postMessage({ type: 'state', state });
  }

  toggleAutoCycle(): void {
    this.autoEnabled = !this.autoEnabled;
    if (this.autoEnabled) {
      let idx = STATE_KEYS.indexOf(this.currentState);
      this.autoTimer = setInterval(() => {
        idx = (idx + 1) % STATE_KEYS.length;
        this.setState(STATE_KEYS[idx]);
      }, 3000);
    } else if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = undefined;
    }
    this.postMessage({ type: 'auto', enabled: this.autoEnabled });
  }

  private postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
    this.panel?.webview.postMessage(message);
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'pet.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css'));
    const nonce = getNonce();

    const imageUris: Record<string, string> = {};
    for (const key of STATE_KEYS) {
      const fileUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'assets', STATES[key].file);
      imageUris[key] = webview.asWebviewUri(fileUri).toString();
    }

    const initialState = JSON.stringify({
      images: imageUris,
      config: STATES
    });

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
  <link href="${styleUri}" rel="stylesheet">
  <title>蓝色女仆鲸鱼娘</title>
</head>
<body>
  <div id="app">
    <div id="speech-bubble" class="bubble hidden" role="status" aria-live="polite">
      <span id="speech-text"></span>
    </div>
    <div id="pet-wrapper" class="wrapper">
      <img id="pet-img" alt="蓝色女仆鲸鱼娘">
    </div>
    <div id="status-badge" class="badge">
      <span class="dot"></span>
      <span id="status-label">待机中</span>
    </div>
    <div id="controls" class="controls">
      <button data-state="idle" title="待机">💤</button>
      <button data-state="thinking" title="思考">🤔</button>
      <button data-state="coding" title="写代码">⌨️</button>
      <button data-state="success" title="完成">🍚</button>
      <button data-state="error" title="报错">😱</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    window.pet.init(${initialState});
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function deactivate(): void {}
