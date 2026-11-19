#!/bin/bash
# Двойной клик — запускает «Звуковой путь» на этом Mac и открывает его в браузере.
cd "$(dirname "$0")"
PORT=5173
( sleep 1; open "http://localhost:$PORT" ) &
echo "Звуковой путь: http://localhost:$PORT  (закройте это окно, чтобы остановить)"
python3 serve.py $PORT
