#!/usr/bin/env python3
"""Build the Unreal-vs-Godot comparison tables/charts from the two summary.csv files.

Usage: python compare_report.py --unreal results/unreal/<run>/Profile --godot results/godot/<run> --out report
Writes: report/data.json (aggregated numbers), report/chart_*.png, report/comparison.csv
The prose report (report/README.md) is written by hand from data.json.
"""
import argparse
import csv
import json
import os
import statistics as st
from collections import defaultdict

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def load(paths):
    rows = []
    for path in paths.split(','):
        with open(os.path.join(path, 'summary.csv'), newline='') as f:
            rows += list(csv.DictReader(f))
    return rows


def agg(rows):
    """group (size, mode) -> mean of numeric columns across repeats"""
    g = defaultdict(list)
    for r in rows:
        g[(int(r['size']), r['mode'])].append(r)
    out = {}
    for k, rs in g.items():
        d = {'n': len(rs), 'blocks': int(rs[0]['blocks']), 'hash': rs[0]['layout_hash']}
        for c in ('build_submit_ms', 'frame_mean_ms', 'frame_p50_ms', 'frame_p95_ms', 'game_p50_ms',
                  'render_p50_ms', 'gpu_p50_ms', 'process_memory_mb', 'draw_calls_p50', 'primitives_p50',
                  'objects_p50', 'first_frame_ms', 'video_mem_mb'):
            vals = [float(r[c]) for r in rs if c in r and r[c] != '']
            if vals:
                d[c] = st.mean(vals)
                d[c + '_min'] = min(vals)
                d[c + '_max'] = max(vals)
        out[k] = d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--unreal', required=True, help='comma separated run dirs')
    ap.add_argument('--godot', required=True, help='comma separated run dirs (Vulkan)')
    ap.add_argument('--godot-d3d12', default='', help='optional run dirs for the D3D12 driver')
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ur, gd = load(a.unreal), load(a.godot)
    U, G = agg(ur), agg(gd)
    D = agg(load(a.godot_d3d12)) if a.godot_d3d12 else {}
    sizes = sorted({k[0] for k in U} & {k[0] for k in G})
    modes = ['ISM', 'Actor']
    hash_ok = {s: U[(s, 'ISM')]['hash'] == G[(s, 'ISM')]['hash'] and U[(s, 'ISM')]['blocks'] == G[(s, 'ISM')]['blocks'] for s in sizes}
    data = {'sizes': sizes, 'hash_match': hash_ok, 'unreal': {}, 'godot': {}, 'godot_d3d12': {}}
    for (s_, m_), d_ in D.items():
        data['godot_d3d12'][f'{s_}/{m_}'] = d_
    for (s, m), d in U.items():
        data['unreal'][f'{s}/{m}'] = d
    for (s, m), d in G.items():
        data['godot'][f'{s}/{m}'] = d
    with open(os.path.join(a.out, 'data.json'), 'w') as f:
        json.dump(data, f, indent=1)

    # flat csv
    cols = ['frame_p50_ms', 'frame_p95_ms', 'game_p50_ms', 'render_p50_ms', 'gpu_p50_ms', 'build_submit_ms',
            'process_memory_mb', 'draw_calls_p50', 'primitives_p50']
    with open(os.path.join(a.out, 'comparison.csv'), 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['size', 'blocks', 'mode', 'engine'] + cols)
        for s in sizes:
            for m in modes:
                for name, DD in (('Unreal D3D12', U), ('Godot Vulkan', G), ('Godot D3D12', D)):
                    d = DD.get((s, m))
                    if d:
                        w.writerow([s, d['blocks'], m, name] + [round(d.get(c, float('nan')), 4) for c in cols])

    colors = {('Unreal', 'ISM'): '#1f77b4', ('Unreal', 'Actor'): '#8fb8de',
              ('Godot', 'ISM'): '#d62728', ('Godot', 'Actor'): '#f0a0a0',
              ('Godot D3D12', 'ISM'): '#2ca02c', ('Godot D3D12', 'Actor'): '#a5d8a5'}
    series = [('Unreal', 'ISM', U), ('Unreal', 'Actor', U), ('Godot', 'ISM', G), ('Godot', 'Actor', G)]
    if D:
        series += [('Godot D3D12', 'ISM', D), ('Godot D3D12', 'Actor', D)]

    def bars(metric, title, fname, unit='ms', logy=False):
        fig, ax = plt.subplots(figsize=(9, 4.6), dpi=130)
        width = 0.8 / len(series)
        for i, (eng, m, DD) in enumerate(series):
            xs = [j + (i - (len(series) - 1) / 2) * width for j in range(len(sizes))]
            ys = [DD.get((s, m), {}).get(metric, 0) for s in sizes]
            ax.bar(xs, ys, width, label=f'{eng} {m}', color=colors[(eng, m)])
            for x, y in zip(xs, ys):
                ax.text(x, y, f'{y:.1f}' if y < 100 else f'{y:.0f}', ha='center', va='bottom', fontsize=5.5, rotation=90)
        ax.set_xticks(range(len(sizes)))
        ax.set_xticklabels([f'size {s}\n({G[(s, "ISM")]["blocks"]} blocks)' for s in sizes])
        ax.set_ylabel(unit)
        ax.set_title(title)
        if logy:
            ax.set_yscale('log')
        ax.legend(fontsize=7, ncol=3)
        ax.grid(axis='y', alpha=0.3)
        fig.tight_layout()
        fig.savefig(os.path.join(a.out, fname))
        plt.close(fig)

    bars('frame_p50_ms', 'Frame time p50 (lower is better)', 'chart_frame_p50.png')
    bars('frame_p95_ms', 'Frame time p95 (lower is better)', 'chart_frame_p95.png')
    bars('build_submit_ms', 'Scene build / submit time (log scale)', 'chart_build.png', logy=True)
    bars('process_memory_mb', 'Process memory (MB, absolute)', 'chart_memory.png', unit='MB')
    bars('gpu_p50_ms', 'GPU time p50 (engine-reported; not directly comparable)', 'chart_gpu.png')
    bars('render_p50_ms', 'Render-side CPU time p50 (UE render thread vs Godot render submit)', 'chart_render_cpu.png')
    print('wrote', a.out)


if __name__ == '__main__':
    main()
