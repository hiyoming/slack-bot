const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getDailyCheckReport } = require('./intraClient');
const { sendMessage } = require('./slackClient');

const channelsPath = path.join(__dirname, '../data/hospitalChannels.json');

function startScheduler() {
  console.log('[Scheduler] 마케팅 데일리 체크 자동 보고 스케줄러 시작');

  // 평일(월-금) 09:30, 13:00, 15:00
  const schedules = [
    '30 9 * * 1-5',
    '0 13 * * 1-5',
    '0 15 * * 1-5'
  ];

  schedules.forEach(scheduleTime => {
    cron.schedule(scheduleTime, async () => {
      console.log(`[Scheduler] 자동 보고 실행 시간: ${scheduleTime}`);
      try {
        const rawData = fs.readFileSync(channelsPath, 'utf8');
        const hospitals = JSON.parse(rawData);

        for (const hospital of hospitals) {
          if (!hospital.slack_channel_id) continue;
          
          try {
            const { hasAnomaly, report } = await getDailyCheckReport(hospital.hospital_name);
            
            // 이상이 있을 때만 슬랙 채널에 보고
            if (hasAnomaly) {
              await sendMessage(hospital.slack_channel_id, report);
              console.log(`[Scheduler] ${hospital.hospital_name} 이상 보고 전송 완료`);
            }
          } catch (err) {
            console.error(`[Scheduler] ${hospital.hospital_name} 리포트 생성 실패:`, err.message);
          }
          
          // API rate limit 방지를 위해 잠시 대기
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error('[Scheduler] 크론 잡 실행 중 에러:', err);
      }
    }, {
      timezone: "Asia/Seoul"
    });
  });
}

module.exports = { startScheduler };
