require('dotenv').config();
const { getDailyCheckReport, intraFetch } = require('./utils/intraClient');
const hospitalChat = require('./channels/hospitalChat');

// Inject the temporary token
process.env.INTRA_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMiIsInJvbGUiOiJzdGFmZl9sZWFkIiwianRpIjoiczNWdjBybW5ocWl6N1lWbXlkcHZ6ZyIsInR5cGUiOiJhY2Nlc3MiLCJpc3MiOiJkbmV3LXYyIiwiaWF0IjoxNzg0ODc1OTI2LCJleHAiOjE3ODQ4NzY4MjZ9.S8OAouZ_OqAXNNU8SdzGrH6pkD8PG0zeIiDBUwBasq4';

async function runTest() {
  const hospitalName = '그대안에산부인과의원 신촌점';
  
  console.log('=== 1. 데일리 체크 테스트 ===');
  const result = await getDailyCheckReport(hospitalName);
  console.log(result.report);

  console.log('\n=== 2. 플레이스 순위 데이터 구조 확인 ===');
  const placeRank = await intraFetch('/api/monitoring/place-rank');
  if (placeRank && placeRank.items) {
    const normalize = (name) => {
      if (!name) return '';
      return name.replace(/\s/g, '').replace(/의원/g, '').replace(/산부인과/g, '').replace(/피부과/g, '').replace(/성형외과/g, '').replace(/치과/g, '').replace(/안과/g, '').replace(/한의원/g, '').replace(/클리닉/g, '');
    };
    const isMatch = (apiName, hospName) => {
      const a = normalize(apiName);
      const b = normalize(hospName);
      return a.includes(b) || b.includes(a) || a === b;
    };
    const matched = placeRank.items.filter(i => isMatch(i.hosp_name, hospitalName));
    console.log(matched);
  }
}

runTest();
