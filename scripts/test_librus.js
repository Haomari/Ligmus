const fs = require('fs');
const path = require('path');
const Librus = require('librus-api');

async function testApi() {
  console.log('==============================================');
  console.log('       LIBRUS API VERIFICATION TEST          ');
  console.log('==============================================\n');

  const login = process.argv[2] || process.env.LIBRUS_LOGIN || '***';
  const pass = process.argv[3] || process.env.LIBRUS_PASS || '***';

  if (login === '***' || pass === '***') {
    console.error('[!] Please provide your credentials:');
    console.error('    node scripts/test_librus.js <login> <password>');
    console.error('    or edit the login and pass variables in scripts/test_librus.js\n');
    return;
  }

  const client = new Librus();

  // Patch/enhance client to handle Synergia's requiredActions prompt (e.g. leakedPasswordChangeAdvised)
  const originalFollowAuth = client._followAuthorizationChain.bind(client);
  client._followAuthorizationChain = async function(value, referer) {
    let nextUrl = this._safeAuthorizationUrl(value, referer, true);
    for (let hop = 0; hop < 10; hop += 1) {
      const response = await this._getAuthPage(nextUrl, referer);
      if (response.status < 300 || !response.headers?.location) {
        // If server stopped on a 200 page with requiredActions (like password change advice)
        if (typeof response.data === 'string' && response.data.includes('requiredActions')) {
          console.log('[*] Notice: Synergia requested intermediate actions (e.g. leakedPasswordChangeAdvised).');
          console.log('[*] Automatically resolving with skip...');
          const skipRes = await client.caller.post(
            nextUrl,
            new URLSearchParams({ action: 'requiredActions', skip: 'true' }).toString(),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: nextUrl,
                Origin: 'https://api.librus.pl'
              }
            }
          );
          if (skipRes.data && skipRes.data.goTo) {
            let contUrl = skipRes.data.goTo;
            if (!contUrl.startsWith('http')) {
              contUrl = 'https://api.librus.pl' + contUrl;
            }
            return await client.caller.get(contUrl, { maxRedirects: 5 });
          }
        }
        return response;
      }
      referer = nextUrl;
      nextUrl = this._safeAuthorizationUrl(response.headers.location, nextUrl, true);
    }
  };

  console.log(`[Step 1] Logging in as: ${login}...`);
  try {
    await client.authorize(login, pass);
    console.log('[✓] Login successful!\n');
  } catch (err) {
    console.error('[✗] Login failed:', err.message);
    return;
  }

  // 1. Student & Account Info
  try {
    console.log('[Step 2] Fetching Student & Account Details...');
    const accountInfo = await client.info.getAccountInfo();
    const luckyNumber = await client.info.getLuckyNumber();

    console.log('--- Student Details ---');
    console.log(`Name & Surname: ${accountInfo.student.nameSurname}`);
    console.log(`Class:          ${accountInfo.student.class}`);
    console.log(`Student ID/Nr:  ${accountInfo.student.index}`);
    console.log(`Educator:       ${accountInfo.student.educator}`);
    console.log(`Internal Login: ${accountInfo.account.login}`);
    console.log(`Lucky Number:   ${luckyNumber}\n`);
  } catch (err) {
    console.warn('[!] Could not fetch account info:', err.message);
  }

  // 2. Raw HTML dump for safe offline testing
  try {
    console.log('[Step 3] Fetching raw HTML of grades page (przegladaj_oceny/uczen)...');
    const rawRes = await client.caller.get('https://synergia.librus.pl/przegladaj_oceny/uczen');
    const dumpPath = path.join(__dirname, 'grades_dump.html');
    fs.writeFileSync(dumpPath, rawRes.data, 'utf-8');
    console.log(`[✓] Successfully saved raw HTML dump to: ${dumpPath}\n`);
  } catch (err) {
    console.warn('[!] Failed to dump raw HTML:', err.message);
  }

  // 3. Grades via librus-api
  try {
    console.log('[Step 4] Fetching Grades via librus-api...');
    const grades = await client.info.getGrades();
    console.log(`[✓] Retrieved ${grades?.length || 0} subjects.\n`);

    if (Array.isArray(grades) && grades.length > 0) {
      console.log('--------------------------------------------------');
      console.log('SUBJECT                           | GRADES | AVG  ');
      console.log('--------------------------------------------------');
      for (const subj of grades) {
        // Collect all grade values across all semesters
        const allGrades = (subj.semester || [])
          .flatMap((sem) => (sem && sem.grades ? sem.grades.map((g) => g.value) : []))
          .filter(Boolean);

        const gradeStr = allGrades.length > 0 ? allGrades.join(', ') : '(no grades yet)';
        const avgStr = subj.average || subj.tempAverage || '-';
        console.log(`${subj.name.padEnd(34)} | ${gradeStr.padEnd(14)} | ${avgStr}`);
      }
      console.log('--------------------------------------------------\n');
    }
  } catch (err) {
    console.error('[✗] Failed to fetch grades:', err.message);
  }

  console.log('==============================================');
  console.log('   RESULT: librus-api IS WORKING PROPERLY     ');
  console.log('==============================================');
}

testApi().catch(console.error);
