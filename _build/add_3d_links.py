# -*- coding: utf-8 -*-
"""统一各游戏页面的入口：
  - 2D 单机 / 2D 联网 / 规则页的导航换成"本地 2D / 本地 3D / 联机 2D / 联机 3D / 规则说明"（当前页 active；
    3D 两页的导航由 build_3d.py 生成，用的是同一份列表）
  - 首页每张卡片：主按钮"本地 3D"，次级"本地 2D / 联机 2D / 联机 3D / 规则说明"
可重复运行（内容一致时不改动）。用法：py add_3d_links.py
"""
import io
import os
import re

from build_3d import NAV_LINKS

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
GAMES = ['snooker/snooker-game', 'nine_ball/nine_ball-game',
         'chinese_eight_ball/chinese_eight_ball-game', 'american_eight_ball/american_eight_ball-game']
PAGES = ['game_2d.html', 'game_2d_online.html', 'game_2d_rules.html']


def edit(path, fn):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    eol = '\r\n' if '\r\n' in raw else '\n'
    text = raw.replace('\r\n', '\n')
    new = fn(text)
    if new == text:
        print('unchanged:', os.path.relpath(path, ROOT))
        return
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new.replace('\n', eol))
    print('updated:  ', os.path.relpath(path, ROOT))


def nav_for(page):
    def fn(text):
        m = re.search(r'(?m)^( *)<a class="nav-link[^\n]*\n(?:\1<a class="nav-link[^\n]*\n)*', text)
        assert m and 'game_2d_rules.html' in m.group(0), 'nav block not found'
        indent = m.group(1)
        block = ''.join('%s<a class="nav-link%s" href="%s">%s</a>\n' % (indent, ' active' if href == page else '', href, label)
                        for href, label in NAV_LINKS)
        return text[:m.start()] + block + text[m.end():]
    return fn


def index_cards(text):
    for g in GAMES:
        m = re.search(r'( *)<a class="primary-link" href="%s/game_[23]d\.html">[^<]*</a>\n'
                      r' *<div class="secondary-row">\n(?: *<a class="secondary-link"[^\n]*\n)+' % re.escape(g), text)
        assert m, 'index card for ' + g
        ind = m.group(1)
        links = [('game_2d.html', '本地 2D'), ('game_2d_online.html', '联机 2D'),
                 ('game_3d_online.html', '联机 3D'), ('game_2d_rules.html', '规则说明')]
        block = ('%s<a class="primary-link" href="%s/game_3d.html">本地 3D</a>\n' % (ind, g)
                 + '%s<div class="secondary-row">\n' % ind
                 + ''.join('%s    <a class="secondary-link" href="%s/%s">%s</a>\n' % (ind, g, href, label) for href, label in links))
        text = text[:m.start()] + block + text[m.end():]
    return text


if __name__ == '__main__':
    for g in GAMES:
        for page in PAGES:
            edit(os.path.join(ROOT, g, page), nav_for(page))
    edit(os.path.join(ROOT, 'index.html'), index_cards)
