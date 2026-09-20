#!/bin/bash

# =========================================================================
# AI Assistant 배포 스크립트 (Local -> Oracle Cloud)
# =========================================================================

# 1. 오라클 클라우드 정보 설정 (본인의 환경에 맞게 수정하세요)
SERVER_IP="130.162.150.37"
SSH_USER="ubuntu"
SSH_KEY_PATH="/Users/akm/Downloads/ssh-key-2025-12-02.key"
REMOTE_DIR="~/ai_assistant_web"

echo "📦 1. 소스코드를 압축하는 중입니다..."
cd "$(dirname "$0")" || exit
tar -czvf ai_assistant_web.tar.gz \
    --exclude=node_modules \
    --exclude=.next \
    --exclude=.git \
    --exclude=ai_assistant_web.tar.gz \
    .

echo "🚀 2. 오라클 클라우드로 전송 중입니다..."
scp -i "$SSH_KEY_PATH" ai_assistant_web.tar.gz "$SSH_USER"@"$SERVER_IP":~/

echo "⚙️ 3. 오라클 클라우드에서 배포를 시작합니다..."
ssh -i "$SSH_KEY_PATH" "$SSH_USER"@"$SERVER_IP" << EOF
    # 압축 해제할 폴더가 없으면 생성
    mkdir -p $REMOTE_DIR
    
    # 압축 해제 (sudo 권한 사용)
    sudo tar -xzvf ~/ai_assistant_web.tar.gz -C $REMOTE_DIR
    
    # 해당 폴더로 이동하여 도커 다시 빌드 및 실행
    cd $REMOTE_DIR
    sudo docker compose up -d --build
    
    # 쓰고 남은 압축 파일 삭제
    rm ~/ai_assistant_web.tar.gz
EOF

echo "✨ 4. 배포가 완료되었습니다! 남은 로컬 압축 파일을 정리합니다."
rm ai_assistant_web.tar.gz

echo "🎉 성공적으로 오라클 클라우드에 업데이트 되었습니다!"
