#!/bin/bash
cd "$(dirname "$0")"
echo "=========================================================="
echo "  🚁 AERORES-AI: Autonomous Disaster Rescue UAV Simulation"
echo "  🏆 Team Pegasus | Smart India Hackathon 2026"
echo "=========================================================="
python3 server.py
if [ $? -ne 0 ]; then
  echo ""
  echo "Press any key to close..."
  read -n 1 -s
fi
