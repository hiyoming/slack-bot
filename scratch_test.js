require('dotenv').config();
const { intraFetch } = require('./utils/intraClient');

async function test() {
  let additionalContext = '';
  const cleanHosp = '그대안에산부인과의원신촌점';
  
  try {
    const [naver, kakao, google] = await Promise.all([
      intraFetch('/api/monitoring/ad-info/naver').catch(e => { console.error(e); return null; }),
      intraFetch('/api/monitoring/ad-info/kakao').catch(e => { console.error(e); return null; }),
      intraFetch('/api/monitoring/ad-info/google').catch(e => { console.error(e); return null; }),
    ]);
    
    additionalContext += '\n[광고 예산 및 잔액 데이터]\n';
    
    const addAdData = (platformName, data) => {
      if (data && data.items) {
        const items = data.items.filter(i => (i.hosp_name || '').replace(/\s/g, '').includes(cleanHosp));
        items.forEach(item => {
          additionalContext += `- ${platformName}: 잔액 ${Number(item.balance || 0).toLocaleString()}원, 전일 소진액 ${Number(item.spending_yesterday || 0).toLocaleString()}원, 월 예산 ${Number(item.monthly_advertise || 0).toLocaleString()}원\n`;
        });
      }
    };
    
    addAdData('네이버', naver);
    addAdData('카카오', kakao);
    addAdData('구글', google);
    
    console.log(additionalContext);
  } catch (err) {
    console.error(err);
  }
}

test();
