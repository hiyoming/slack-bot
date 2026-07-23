const { getHospitalByName } = require('../utils/dbMock');
const { sendMessage } = require('../utils/slackClient');

// 테스트용: 인메모리 상태 저장소 (실제 서비스에서는 DB나 Redis 사용 권장)
// 키: 스레드 TS, 값: { hospitalName, state, timerId, managerId, channel }
const scheduleStates = new Map();

// 상태 흐름: 체크대기 -> 팝업제작중 -> 포털수정대기 -> 완료
const STATES = {
  WAITING_CHECK: '체크대기',
  MAKING_POPUP: '팝업제작중',
  WAITING_PORTAL: '포털수정대기',
  DONE: '완료'
};

const TIMEOUT_MS = 60 * 1000; // 에스컬레이션 타임아웃 1분 (테스트용)

/**
 * 에스컬레이션(독촉) 타이머 설정
 */
function setEscalationTimer(thread_ts) {
  const data = scheduleStates.get(thread_ts);
  if (!data || data.state === STATES.DONE) return;

  // 기존 타이머가 있으면 제거
  if (data.timerId) clearTimeout(data.timerId);

  // 새 타이머 설정 (1분 뒤 실행)
  data.timerId = setTimeout(async () => {
    const currentState = scheduleStates.get(thread_ts);
    if (currentState && currentState.state !== STATES.DONE) {
      await sendMessage(
        currentState.channel,
        `🚨 <@${currentState.managerId}> 님! 진료일정 작업이 '${currentState.state}' 단계에서 지연되고 있습니다. 신속한 처리 부탁드립니다!`,
        thread_ts
      );
      
      // 알림 후에도 계속 독촉하고 싶다면 여기서 타이머를 재귀적으로 다시 세팅할 수 있습니다.
      // setEscalationTimer(thread_ts); 
    }
  }, TIMEOUT_MS);
}

/**
 * 새로운 메시지가 들어왔을 때 처리 (트리거)
 */
async function handleScheduleMessage(event) {
  // 수동 트리거 명령어 확인: "@봇 진료일정시작 강남OO의원"
  const triggerRegex = /진료일정시작\s+(.+)/;
  const match = event.text.match(triggerRegex);
  
  if (match) {
    const hospitalName = match[1].trim();
    const hospital = getHospitalByName(hospitalName);
    
    if (!hospital) {
      await sendMessage(event.channel, `⚠️ '${hospitalName}' 병원 정보를 찾을 수 없습니다. (목업 데이터 확인 필요)`, event.ts);
      return;
    }
    
    const managerId = hospital.manager_slack_id;
    
    // 워크플로우 시작 메시지를 스레드로 남기기 위해 먼저 부모 메시지에 답글을 답니다.
    await sendMessage(
      event.channel,
      `📅 *[${hospitalName}]* 진료일정 워크플로우를 시작합니다.\n\n현재 상태: 🟡 *${STATES.WAITING_CHECK}*\n<@${managerId}> 님, 일정을 확인하신 후 스레드에 \`@봇 팝업제작중\` 이라고 쳐서 다음 단계로 넘어가주세요.`,
      event.ts
    );
    
    // 상태 저장
    scheduleStates.set(event.ts, {
      hospitalName: hospitalName,
      state: STATES.WAITING_CHECK,
      managerId: managerId,
      channel: event.channel,
      timerId: null
    });
    
    // 에스컬레이션 타이머 가동
    setEscalationTimer(event.ts);
  }
}

/**
 * 스레드에 댓글이 달렸을 때 상태 전이 처리
 */
async function handleScheduleCompletion(event) {
  const data = scheduleStates.get(event.thread_ts);
  if (!data) return; // 우리가 관리하는 스레드가 아니면 무시

  if (data.state === STATES.DONE) return; // 이미 완료된 건 무시

  const text = event.text;
  let nextState = null;
  let nextMessage = "";

  // 현재 상태에 따른 분기 및 다음 상태 결정
  if (data.state === STATES.WAITING_CHECK && text.includes('팝업제작중')) {
    nextState = STATES.MAKING_POPUP;
    nextMessage = `현재 상태: 🔵 *${STATES.MAKING_POPUP}*\n디자인팀, 팝업 제작이 완료되면 \`@봇 포털수정대기\` 라고 쳐주세요.`;
  
  } else if (data.state === STATES.MAKING_POPUP && text.includes('포털수정대기')) {
    nextState = STATES.WAITING_PORTAL;
    nextMessage = `현재 상태: 🟠 *${STATES.WAITING_PORTAL}*\n<@${data.managerId}> 님, 포털(네이버/카카오 등) 반영이 완료되면 \`@봇 완료\` 라고 쳐주세요.`;
  
  } else if (data.state === STATES.WAITING_PORTAL && text.includes('완료')) {
    nextState = STATES.DONE;
    nextMessage = `현재 상태: 🟢 *${STATES.DONE}*\n🎉 진료일정 워크플로우가 모두 종료되었습니다!`;
  }

  // 상태가 전이되었다면
  if (nextState) {
    data.state = nextState;
    await sendMessage(event.channel, nextMessage, event.thread_ts);

    if (nextState === STATES.DONE) {
      // 완료 시 타이머 해제
      if (data.timerId) clearTimeout(data.timerId);
      scheduleStates.delete(event.thread_ts); // 관리 대상에서 제거
    } else {
      // 타이머 재시작 (1분 초기화)
      setEscalationTimer(event.thread_ts);
    }
  }
}

module.exports = {
  handleScheduleMessage,
  handleScheduleCompletion
};
