# -*- coding: utf-8 -*-
"""野外四图背景音乐:用 ACE-Step 1.5(本地开源 AI 整曲生成,MIT,可商用)批量出纯音乐候选(2026-11-22)。

用户试过我自己编曲的几版(合成器 / 采样 / 中国风)都说「AI 感太强」,改走「整曲直接生成」:
每张图写一段风格描述 → 每图生成若干版 → field_bgm_pick.py 自动筛 + 找循环点 → 发用户挑。

环境:D:\\ace-step(git clone ACE-Step-1.5 + uv sync,模型在 D:\\ace-step\\checkpoints),必须用它的虚拟环境跑:
  D:\\ace-step\\.venv\\Scripts\\python.exe tools/qa/field_bgm_ace.py [图码…] [--takes 8] [--secs 150] [--no-think] [--lm 1.7B|0.6B]
      [--model acestep-v15-xl-turbo --quant int8] [--vae scragvae] [--tag 实验名]
产物:%TEMP%/lootchain-qa/field_bgm_ace/<图>/<图>_<序号>_<种子>.wav + runs.jsonl(参数 / 种子 / 模型改写后的描述 / 耗时)。
"""
import json
import os
import sys
import time

ACE = os.environ.get('ACESTEP_ROOT', r'D:\ace-step')
OUT = os.path.join(os.environ.get('LC_QA_OUT') or os.path.join(os.environ.get('TEMP', '.'), 'lootchain-qa'), 'field_bgm_ace')

# 风格描述:西式奇幻 MMORPG 野外曲;用户要「有记忆点的主旋律」「大气」,不要「太吵太满」「太单调」;不要中国风。
# 段落写进描述里(纯音乐的歌词栏只能写 [Instrumental],训练数据就是这么标的)。
# 第一批(11-22)用户:「可以用,就是音质比较差」「听起来像收音机的音质」→ 第二版去掉 classic / nostalgic /
# natural live orchestra recording(训练数据里常跟老录音、复古音色绑在一起),结尾统一加 HIFI 高保真录音室制作描述。
# 「airy highs / crisp」会被理解成加嘶嘶的空气声(频谱上整块高频噪声开关),改成只讲真实乐器和录音质量
HIFI = ('Recorded by a real symphony orchestra in a professional scoring stage, polished modern film-score mix, '
        'clean and detailed instrument tone, natural warm sound, wide stereo image, instrumental.')

MAPS = {
    'VILLAGE': dict(bpm=84, keyscale='D Major', caption=(
        'A warm, heartfelt orchestral theme for the starting village of a fantasy MMORPG at sunrise. '
        'It opens with gentle harp and soft strings, then a lyrical solo flute plays a simple, memorable main melody '
        'over plucked acoustic guitar and warm French horns. The middle section adds a sweeping string swell that feels '
        'grand but peaceful, then the flute theme returns. Pastoral, hopeful, gentle, spacious and uncluttered. ' + HIFI)),
    'WOODS': dict(bpm=96, keyscale='G Major', caption=(
        'A bright, adventurous exploration theme for a lush green forest in a fantasy MMORPG. '
        'Pizzicato strings and harp arpeggios set a light walking pace, while oboe and clarinet trade a catchy, singable '
        'main melody with soft celesta sparkles and gentle hand percussion. The theme grows into a warm, full orchestral '
        'passage with horns and strings, then settles back to the woodwinds. Curious, lively yet calm, magical, sunlit. ' + HIFI)),
    'GRAY': dict(bpm=70, keyscale='D minor', caption=(
        'A vast, lonely wasteland theme for a fantasy MMORPG: wind over gray rocks under an open sky. '
        'A solo cello and a breathy low wooden flute carry a slow, haunting but beautiful main melody over sustained low '
        'string drones and soft timpani rolls. The middle builds into a broad, epic statement of the theme by strings and '
        'horns, then fades back to the lone cello. Desolate, majestic, melancholic, wide open space, restrained. ' + HIFI)),
    'DEADWOOD': dict(bpm=64, keyscale='E minor', caption=(
        'A dark, mysterious theme for a withered dead forest in a fantasy MMORPG at dusk. '
        'Low tremolo strings and a slow pulsing bass create quiet tension, and a haunting solo violin plays an eerie yet '
        'beautiful minor-key melody, answered by a delicate music box and airy high string harmonics. The middle rises '
        'gently into a fuller, ominous passage with soft low brass, then returns to the violin theme; steady dynamics, no sudden silences. '
        'Eerie, sorrowful, suspenseful but not horror, atmospheric. ' + HIFI)),
}


def main():
    args = sys.argv[1:]
    opt = lambda k, d: args[args.index(k) + 1] if k in args else d
    codes = [a for a in args if a in MAPS] or list(MAPS)
    takes = int(opt('--takes', '8'))
    # --seeds 1,2,3:固定种子重跑(同一首曲子换解码器 / 模型做公平对比);给了就按种子个数生成
    seeds = [int(x) for x in opt('--seeds', '').split(',') if x.strip()]
    if seeds:
        takes = len(seeds)
    secs = float(opt('--secs', '150'))
    think = '--no-think' not in args
    lm = opt('--lm', '1.7B')
    steps = int(opt('--steps', '8'))
    model = opt('--model', 'acestep-v15-turbo')          # 或 acestep-v15-xl-turbo(4B,音质更高;12GB 卡要 --quant int8)
    vae = opt('--vae', 'official')                       # 或 scragvae(社区改进解码器)
    quant = {'int8': 'int8_weight_only'}.get(opt('--quant', ''), None)
    tag = opt('--tag', '')                               # 实验输出放 OUT/<tag>/,不和正式批混
    out_root = os.path.join(OUT, tag) if tag else OUT
    sys.path.insert(0, ACE)
    os.chdir(ACE)
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    t0 = time.time()
    dit = AceStepHandler()
    # XL(4B,bf16 约 8GB)在 12GB 卡上:扩散完把 DiT 挪回内存,给 LM 构思和 VAE 解码腾显存(不挪会溢出到共享内存,一版要 3 分多钟)
    msg, ok = dit.initialize_service(project_root=ACE, config_path=model, device='cuda', offload_to_cpu=True,
                                     offload_dit_to_cpu='xl' in model, quantization=quant, vae_checkpoint=vae)
    if not ok:
        raise SystemExit('DiT init failed: ' + str(msg))
    llm = LLMHandler()
    if think:
        msg, ok = llm.initialize(checkpoint_dir=os.path.join(ACE, 'checkpoints'), lm_model_path=f'acestep-5Hz-lm-{lm}',
                                 backend='pt', device='cuda', offload_to_cpu=True)
        if not ok:
            raise SystemExit('LM init failed: ' + str(msg))
    print(f'init {time.time() - t0:.1f}s', flush=True)

    for code in codes:
        m = MAPS[code]
        d = os.path.join(out_root, code)
        os.makedirs(d, exist_ok=True)
        n = 0
        while n < takes:
            batch = 1 if seeds else min(2, takes - n)
            params = GenerationParams(task_type='text2music', caption=m['caption'], lyrics='[Instrumental]', instrumental=True,
                                      bpm=m['bpm'], keyscale=m['keyscale'], timesignature='4', vocal_language='unknown',
                                      duration=secs, inference_steps=steps, shift=3.0, seed=seeds[n] if seeds else -1, thinking=think)
            config = GenerationConfig(batch_size=batch, audio_format='wav', use_random_seed=not seeds,
                                      seeds=[seeds[n]] if seeds else None)
            t1 = time.time()
            res = generate_music(dit, llm if think else None, params, config, save_dir=d)
            dt = time.time() - t1
            if not res.success:
                print(code, 'FAILED', res.status_message or res.error, flush=True)
                break
            for a in res.audios:
                n += 1
                p = a.get('path')
                seed = a.get('params', {}).get('seed')
                dst = os.path.join(d, f'{code}_{n:02d}_{seed}.wav')
                if p and os.path.exists(p):
                    os.replace(p, dst)
                rec = {'code': code, 'take': n, 'seed': seed, 'file': dst, 'secs': secs, 'think': think, 'lm': lm if think else None,
                       'model': model, 'vae': vae, 'quant': quant, 'steps': steps, 'tag': tag,
                       'gen_s': round(dt / max(1, len(res.audios)), 1),
                       'cot': {k: a.get('params', {}).get(k) for k in ('cot_bpm', 'cot_keyscale', 'cot_caption', 'bpm', 'keyscale')}}
                with open(os.path.join(out_root, 'runs.jsonl'), 'a', encoding='utf-8') as f:
                    f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                print(code, n, seed, f'{dt:.1f}s', flush=True)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    main()
