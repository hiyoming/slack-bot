const { getHospitalByName, getDesignRule } = require('../utils/dbMock');
const { sendMessage, sendDM, getOriginalMessage } = require('../utils/slackClient');

// 정규식: "[병원명] 항목명 - 내용" 추출
// 예: "[강남OO의원] 인스타카드뉴스 - 여름 이벤트용" -> match[1]: 강남OO의원, match[2]: 인스타카드뉴스, match[3]: 여름 이벤트용
const designRegex = /^\[(.*?)\]\s*(.*?)\s*-\s*(.*)/;

/**
 * 채널에 새로운 메시지가 올라왔을 때 파싱하고 반응하는 함수
 */
async function handleDesignMessage(event) {
  const match = event.text.match(designRegex);
  if (match) {
    const hospitalName = match[1].trim();
    const itemName = match[2].trim();
    const content = match[3].trim();
    
    console.log(`[디자인채널] 요청 인식 - 병원: ${hospitalName}, 항목: ${itemName}, 내용: ${content}`);
    
    // 필요 시 여기에 접수 알림 등의 추가 로직 작성 가능
    // await sendMessage(event.channel, `접수되었습니다.`, event.ts); 
  }
}

/**
 * 스레드에 "완료"라고 댓글이 달렸을 때 처리하는 함수
 */
async function handleDesignCompletion(event) {
  // 1. 스레드의 원본(부모) 메시지 텍스트를 가져와서 어떤 요청이었는지 확인합니다.
  const originalMessage = await getOriginalMessage(event.channel, event.thread_ts);
  if (!originalMessage || !originalMessage.text) return;

  const match = originalMessage.text.match(designRegex);
  if (!match) return; // 정해진 포맷의 메시지가 아니면 무시

  const hospitalName = match[1].trim();
  const itemName = match[2].trim();
  
  // 2. DB(인트라넷 목업)에서 병원 담당자와 항목별 완료 규칙을 조회합니다.
  const hospital = getHospitalByName(hospitalName);
  const rule = getDesignRule(itemName);

  if (!hospital) {
    await sendMessage(event.channel, `⚠️ '${hospitalName}' 병원 정보를 찾을 수 없습니다. (목업 데이터 확인 필요)`, event.ts);
    return;
  }
  if (!rule) {
    await sendMessage(event.channel, `⚠️ '${itemName}' 항목에 대한 완료 규칙을 찾을 수 없습니다. (목업 데이터 확인 필요)`, event.ts);
    return;
  }

  const managerId = hospital.manager_slack_id;
  const action = rule.completion_action;

  // 3. 완료 규칙(completion_action)에 따라 동작을 분기합니다.
  if (action === "승인필요") {
    // 3-1. 채널 스레드에는 안내 메시지 게시
    await sendMessage(event.channel, `<@${managerId}> 님, 디자인 작업이 완료되었습니다. 확인 후 승인 부탁드립니다.`, event.ts);
    
    // 3-2. 담당자에게 개인 DM으로 승인/반려 버튼 발송
    const blocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `*[승인요청]* ${hospitalName}의 '${itemName}' 디자인 작업이 완료 처리되었습니다.\n결과물을 확인하시고 승인 또는 반려해주세요.`
        }
      },
      {
        "type": "actions",
        "elements": [
          {
            "type": "button",
            "text": { "type": "plain_text", "text": "승인", "emoji": true },
            "style": "primary",
            "value": "approve",
            // action_id에 스레드 정보를 숨겨서 보냅니다. (나중에 버튼 클릭 시 어느 스레드인지 알기 위해)
            "action_id": `design_approve_${event.channel}_${event.thread_ts}`
          },
          {
            "type": "button",
            "text": { "type": "plain_text", "text": "반려", "emoji": true },
            "style": "danger",
            "value": "reject",
            "action_id": `design_reject_${event.channel}_${event.thread_ts}`
          }
        ]
      }
    ];
    await sendDM(managerId, "디자인 승인 요청이 도착했습니다.", blocks);

  } else if (action === "안내만") {
    // 알림만 보내고 응답(버튼)은 불필요
    await sendMessage(event.channel, `<@${managerId}> 님, 디자인 작업이 완료되었습니다. (안내)`, event.ts);
    await sendDM(managerId, `*[완료안내]* ${hospitalName}의 '${itemName}' 디자인 작업이 완료되었습니다.`);
  
  } else if (action === "없음") {
    // 아무런 알림 없이 스레드 조용히 종료
    await sendMessage(event.channel, `디자인 작업이 내부적으로 완료 처리되었습니다. (알림 없음)`, event.ts);
  }
}

module.exports = {
  handleDesignMessage,
  handleDesignCompletion
};
