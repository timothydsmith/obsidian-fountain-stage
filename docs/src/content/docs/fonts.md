---
title: "Fonts"
description: "Using your own fonts in PDFs, from font files in your vault."
---

PDFs use Times unless a style names a font family and your fonts folder (`Fountain Stage/Fonts` unless you change it) has it. APT asks for Palatino. Put the font's `.ttf` or `.otf` files in the folder: Fountain Stage reads each file's own family name, weight and style, so file names don't matter. A family name also finds families it starts, so `Palatino` finds Palatino Linotype. If the family is missing, the PDF uses the style's fallback font and a notice says so. Font collections (`.ttc`) can't be used.
