const fs = require('fs');
const path = require('path');

const hospitalsPath = path.join(__dirname, '../data/hospitals.json');
const designRulesPath = path.join(__dirname, '../data/design_rules.json');

// ------------------------------------------------------------------
// [인트라넷 연동 지점 1] 병원 이름으로 병원/담당자 정보 조회
// 나중에 이 함수 내부를 "axios.get('https://인트라넷API/hospitals?name=...')" 로 교체하세요.
// ------------------------------------------------------------------
function getHospitalByName(hospitalName) {
  try {
    const data = JSON.parse(fs.readFileSync(hospitalsPath, 'utf8'));
    return data.find(h => h.name === hospitalName);
  } catch (error) {
    console.error('목업 DB(hospitals.json) 읽기 에러:', error);
    return null;
  }
}

// ------------------------------------------------------------------
// [인트라넷 연동 지점 2] 디자인 항목 이름으로 완료 규칙(승인필요 등) 조회
// 나중에 이 함수 내부를 인트라넷 API 호출로 교체하세요.
// ------------------------------------------------------------------
function getDesignRule(itemName) {
  try {
    const data = JSON.parse(fs.readFileSync(designRulesPath, 'utf8'));
    return data[itemName];
  } catch (error) {
    console.error('목업 DB(design_rules.json) 읽기 에러:', error);
    return null;
  }
}

module.exports = {
  getHospitalByName,
  getDesignRule
};
