// 由 tools/qa/field_repaint.py export 生成:野外整图重绘的图块表(px = 每世界单位像素;图块从地图左上角起 tileW × tileH 切)。
export interface FieldPaintDef { px: number; tileW: number; tileH: number; cols: number; rows: number; w: number; h: number; mapW: number; mapH: number; dir: string }
export const FIELD_PAINT: Record<string, FieldPaintDef> = {"WOODS": {"px": 0.75, "tileW": 2048, "tileH": 1024, "cols": 8, "rows": 8, "w": 15255, "h": 7341, "mapW": 20340, "mapH": 9788, "dir": "ui/world/woods_paint"}};
