const designRegex = /\[(.*?)\]\s*(.*?)\s*[-—–]\s*(.*)/;

const testStrings = [
  "[강남OO의원] 인스타카드뉴스 - 여름 이벤트용 이미지 제작 부탁드립니다.",
  "• [강남OO의원] 인스타카드뉴스 - 여름 이벤트용 이미지 제작 부탁드립니다.",
  " [강남OO의원] 인스타카드뉴스 - 여름 이벤트용 이미지 제작 부탁드립니다."
];

testStrings.forEach((text, i) => {
  const match = text.match(designRegex);
  if (match) {
    console.log(`Test ${i + 1} SUCCESS: Hospital: ${match[1]}, Item: ${match[2]}, Content: ${match[3]}`);
  } else {
    console.log(`Test ${i + 1} FAILED`);
  }
});
