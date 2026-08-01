const fs = require('fs');
const p = 'assets/scripts/scenes/lobby/LobbyAdventurePanelRenderer.ts';
let t = fs.readFileSync(p, 'utf8');

// 1. 添加 import
const oldImport = "import type { LobbyFormationPowerSnapshot } from './LobbyFormationPanelRenderer';";
const newImport = oldImport + "\nimport { BattleStageMapRenderer, type BattleStageMapHost } from './BattleStageMapRenderer';";
if (!t.includes(oldImport)) { console.log('import anchor not found'); process.exit(1); }
t = t.replace(oldImport, newImport);

// 2. 替换 renderStageMap 方法体
const oldMethod = `  private renderStageMap(parent: Node, chapters: LobbyAdventureChapterVO[], x: number, y: number, width: number, height: number, scale: number, selectedStageCode: string): void {
    const panel = this.host.addChildPlainNode(parent, 'LobbyAdventureStageMap', x, y, width, height);
    const graphics = panel.addComponent(Graphics);
    this.drawSectionFrame(graphics, width, height, scale, rgba(4, 5, 7, 176));
    this.drawMapVeins(graphics, width, height, scale);
    const allStages = chapters.flatMap((chapter) => chapter.stages);
    const recommendedStageCode = allStages.find((stage) => stage.recommended)?.stageCode ?? '';
    const stages = this.visibleStageWindow(allStages, selectedStageCode || recommendedStageCode, 7);
    const usableWidth = width - 90 * scale;
    stages.forEach((stage, index) => {
      const progress = stages.length <= 1 ? 0.5 : index / (stages.length - 1);
      const nodeX = -usableWidth / 2 + usableWidth * progress;
      const nodeY = Math.sin(progress * Math.PI * 2.2) * 42 * scale;
      this.renderStageNode(panel, stage, index, nodeX, nodeY, 78 * scale, scale, stage.stageCode === selectedStageCode);
    });
  }`;

const newMethod = `  private renderStageMap(parent: Node, chapters: LobbyAdventureChapterVO[], x: number, y: number, width: number, height: number, scale: number, selectedStageCode: string): void {
    // Stage 13A：接入 BattleStageMapRenderer（虚线路径 + Boss 节点 + 章节标题）
    const mapHost: BattleStageMapHost = {
      createUiNode: (name) => this.host.createUiNode(name),
      addChildPlainNode: (p2, name, x2, y2, w2, h2) => this.host.addChildPlainNode(p2, name, x2, y2, w2, h2),
      addChildLabel: (p2, name, text, x2, y2, fs, color, size, align) => this.host.addChildLabel(p2, name, text, x2, y2, fs, color, size, align),
      addSprite: (name, assetPath, x2, y2, w2, h2, p2) => this.host.addSprite(name, assetPath, x2, y2, w2, h2, p2),
      applyImageButtonFeedback: (node, hover, pressed) => this.host.applyImageButtonFeedback(node, hover, pressed),
      selectStage: (stageCode) => this.host.selectLobbyAdventureStage(stageCode),
      previewLockedStage: (stageCode) => this.host.previewLockedLobbyAdventureStage(stageCode),
    };
    const mapPanel = this.host.addChildPlainNode(parent, 'LobbyAdventureStageMap', x, y, width, height);
    const activeChapter = chapters.find((c) => c.stages.some((s) => s.stageCode === selectedStageCode)) || chapters[0] || null;
    const renderer = new BattleStageMapRenderer(mapHost);
    renderer.render(mapPanel, chapters, width, height, scale, selectedStageCode, activeChapter);
  }`;

if (!t.includes(oldMethod)) { console.log('method not found'); process.exit(1); }
t = t.replace(oldMethod, newMethod);
fs.writeFileSync(p, t);
console.log('integration done, len=' + t.length);