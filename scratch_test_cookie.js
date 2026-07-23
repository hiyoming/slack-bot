const REFRESH = '4V6ktpnVFxRxR5X24lg3_3NvCuZ4IPOrelKFtsPIg91eq3I_9fA_Vy634TAcRZS4';
const CSRF = 'NhPuxxEYQaaW6WGk9uUSaQnvzSQa7rm01Caq9rlYIM4';
const ACCESS = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyMiIsInJvbGUiOiJzdGFmZl9sZWFkIiwianRpIjoiMUYtR01LVmxSZVJITl9hMDJrWm1vUSIsInR5cGUiOiJhY2Nlc3MiLCJpc3MiOiJkbmV3LXYyIiwiaWF0IjoxNzg0NzkxNDE2LCJleHAiOjE3ODQ3OTIzMTZ9.W_ZmELsT2M2LdJVGGcBikvUToGRoHr_sQoAffoR9oC4';

async function test() {
  const cookie = `access_token=${ACCESS}; csrf_token=${CSRF}; refresh_token=${REFRESH}`;
  const res = await fetch('https://intra.dnew.co.kr/api/refresh', {
    method: 'POST',
    headers: {
      'Cookie': cookie,
      'x-csrf-token': CSRF
    }
  });
  
  console.log('Status:', res.status);
  console.log('Set-Cookie:', res.headers.get('set-cookie'));
  if (res.ok) {
    const data = await res.json();
    console.log('Data items count:', data.items?.length);
  } else {
    console.log('Error text:', await res.text());
  }
}
test();
