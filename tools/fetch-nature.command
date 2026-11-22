#!/bin/bash
# Двойной клик — скачать библиотеку звуков природы в samples/nature-library
cd "$(dirname "$0")" && bash ./fetch-nature.sh
echo; read -n 1 -s -r -p "Нажмите любую клавишу, чтобы закрыть"
