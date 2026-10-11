# 번역 미확정 항목 (Open Questions)

곡 노트의 큐레이션 번역(`src/editorial/notes/songs/<key>.translation.json`)에서 **뜻이나 해석을 확정하지 못한 줄**을 모아 두는 문서다.
확정되면 항목을 "해결됨" 표로 옮기고, 해당 곡의 번역 문장·`translation.glossary`·`## 번역에 대하여`·`sources`를 같이 고친다.

## 규칙

- **원문 가사를 쓰지 않는다.** 줄은 곡 키와 `npm run lyrics:lines` 표의 **줄 번호**로 가리키고, 설명에 필요하면 몇 단어까지만 인용한다 (`translate-lyrics` 스킬의 저작권 규칙).
- 줄 번호는 그 곡의 `timing.lrclibId` 레코드 기준이다. 레코드를 바꾸면 번호가 달라지므로 바꿀 때 이 문서도 같이 고친다.
- Genius 주석, 인터뷰, 사전에서 얻은 근거는 요지만 적고 출처(곡 페이지 이름, URL)를 남긴다. Genius 주석 문장을 그대로 붙여 넣지 않는다.
- 새로 의심이 생긴 곡은 **아래 표에 한 줄 추가**한다. 번역을 쓰는 중에 모르는 줄이 나오면 지어내지 말고 여기에 적고, 그 곡의 `## 번역에 대하여`에도 불확실하다고 한 문장 남긴다.

항목 형식: `곡 키 · 줄 · 쟁점 · 현재 번역 · 필요한 근거`

## 미확정

### Tyler 『Flower Boy』

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| where-this-flower-blooms | 후렴 | rock / roll / bloom / grow / glow가 이어지는 소리 말장난 | 흔들고, 구르고 / 피어나고, 자란다 / 빛난다 | 한국어에서 소리를 맞출 수 없음. 낱말 선택만 재검토 |
| who-dat-boy | 52 | 'push weight'가 마약 유통인지 어머니가 말한 몸무게와 겹친 말장난인지 | 큰 물량을 굴려서 | Genius 주석 |
| pothole | 15 | 'you off it'이 약물과 이어지는지 | 네가 완전히 맛이 갔다 | Genius 주석 |
| garden-shed | 39 | Spotify 공식 가사는 "base 10"(bass 아님)으로 확정. 십진법을 뜻하는 말이 이 자리에서 무엇을 가리키는지는 해설을 못 찾음 | 베이스 10(base 10)의 열렬한 팬이었고 | Genius 주석, 인터뷰 |
| garden-shed | 40 | 'Polka dot' | 직역 | Genius 주석 |
| boredom | 41 | 'fall this morning' | 무너져 내려 | Genius 주석 |
| boredom | 79 | 끝 대사 'Ride's over…' | 이제 타는 건 끝났어 | 자동차인지 놀이기구인지 |
| i-aint-got-time | 59(번역 60) | 'keep sporting'이 착용인지 뒤 줄과 이어지는 말인지 | 이대로 입고 다닐 거야 | Genius 주석 |
| (주근깨 주석) | — | 사용자가 준 주석 중 "타일러가 주근깨를 매력적으로 본다"는 줄이 어느 곡인지 모름 | — | 곡과 줄 확인 후 반영 |

### Oasis 『Definitely Maybe』

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| shakermaker | 9 | "I'm sorry" 대목의 청자 | 사과하는 반말 | 노엘 인터뷰 |
| supersonic | 32 | "done it"의 뜻 (성관계 암시로 읽되 목적어를 흐려 둠) | 의사랑 그걸 했어 | 노엘 설명 (현재는 없음) |
| live-forever | — | "how your garden grows" (남의 일에 관심 없다는 뜻으로 읽는 해석) | 직역 | 노엘 설명 |

### Fiona Apple / Kanye West / Post Malone (재검토 라운드 1)

Genius 등 줄 단위 해설 사이트가 봇 접근 차단(403)이라 대부분 근거를 못 얻었다. 아래는 Genius 주석이나 Spotify 공식 가사 확인이 필요하다.

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| wolves | 30 | "Don't fire fight"의 어순 (fight fire의 도치인지) | 불을 끄려 하지 마 | Spotify 공식 가사 |
| candy-paint | 22 | "Slide boy"의 속어 뜻 | 미끄러지듯 내려와, 젠장, 난 뜨거워 | 주석, 공식 가사 |
| cold | 41 | "don't gather hearts too" (사용자도 모름) | 말을 참을 수가 없어, 마음을 모으지 마 | 주석 |
| cold | 43–44 | "aim three" 받아쓰기 (고유명사일 가능성) | 난 혼자 올라왔을 뿐이야 / 그건 내 잘못이었어 | Spotify 공식 가사 |
| die-for-me | 39 | "From your passport"의 뜻 | 네 여권을 보니 거짓말하는 것 같아 | Spotify 공식 가사 |
| die-for-me | 41 | "you flying"이 취했다는 뜻인지 비행기를 탔다는 뜻인지 | 넌 약해져서 날아갔지 | 주석 |
| die-for-me | 36 | "bad girl"을 "끝내주는 여자"로 읽음 (웹 근거 없음) | 끝내주는 여자 | 주석 |
| die-for-me | 37–45 | 퓨처 절 전반의 받아쓰기 | 현재 번역 유지 | Spotify 공식 가사 |
| goodbyes | 28–29 | 'cut'이 성관계 속어를 겸하는지 (content-farm 한 곳만 그렇게 해석) | 칼 없이 널 잘라 내려 해 | 신뢰할 만한 주석 |
| goodbyes | 30 | "my argue possessive, it got you precise" | 내 집착하는 말다툼이 널 정확히 꿰뚫었지 | Spotify 공식 가사 |
| goodbyes | 32–34 | "blue diamond, no shark", "Barbie life doll", "on the charger" | 차고를 가득 채워, 파란 다이아몬드, 상어는 없어 / 넌 바비 인형 같은 삶, 니키 미나즈처럼 / 네 차는 충전 중이야 | 주석 |
| take-what-you-want | 40–45 | 표기는 Spotify 공식 가사로 확인됨. crack, pipe 같은 은어의 뜻은 미확정이라 거친 구어체로 옮김 | 그 애가 돌아와 / 보자마자 필요해 / 싹 다 도로 까 놓고 / 그 애한테 파이프를 물려 / 우리 패거리 전부 / 그 애는 삐뚤어졌어 | Spotify 공식 가사, 주석 |
| take-what-you-want | 30–32 | "ran through it"의 주어와 대상 | 다들 한 번씩 거쳐 갔어 | 주석 |
| too-young | 26 | "poppin' that woe"가 약물 은어인지 | 약을 하고 | 슬랭 사전, 주석 |
| too-young | 30 | "got that bitch off"의 뜻 (오르가즘인지 쫓아냈다는 뜻인지) | 그 여자를 보내고 | 주석 |
| too-young | 12 | 'papadeauxs'를 Pappadeaux 체인으로 본 연결은 해석 | 파파도에서 밥을 먹어 | 공식 가사 |
| yours-truly-austin-post | 25, 29 | "put that sauce on that bitch"의 대상, "bought out my brain", "kerosene"의 뜻과 받아쓰기 | 그 여자한테 금방 멋을 입혀 주고 / 머리가 텅 빌 만큼 다 써 버렸어 / 등유를 잔뜩 구해 오자 | 주석, Spotify 공식 가사 |

### tripleS 『ASSEMBLE』 / NMIXX 『Blue Valentine』

| 곡 | 줄 | 쟁점 | 현재 처리 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| before-the-rise | — | LRCLIB에 가사가 없음. 연주곡인지, 보컬이 있는 곡인지 확정 못 함 (위키 표에는 작사자 칸이 비어 있고 0:53) | 노트 변경 없음 (`lyricsLanguage` 미지정) | Spotify 가사 탭 확인, 크레디트 |
| chowall | 1–2, 13–14 | 'la-la' 허밍 줄에 '라라라'를 번역으로 적은 처리가 앱에서 어떻게 보이는지 | 소리만 적음 | 앱 화면 확인 |
| chowall | 5–12 | "All hands on deck"의 관용구 뉘앙스 (전원 출동) | 모두 갑판으로 | 인터뷰, 컨셉 설명 |
| crush-on-you | — | 한국어 곡으로 판단했으나 LRCLIB 레코드가 로마자 표기본이라 한글 줄 비율로 판별하지 못함 | `lyricsLanguage: ko` (노트 본문 900자 미달로 `PENDING_REVIEW` 유지) | Spotify 가사 탭에서 한글 비율 확인 |
| adore-u | — | 한국어 줄 약 59%로 경계(40~60%)에 걸침. 영어 훅 비중이 큼 | `lyricsLanguage: ko` (본문 900자 미달로 `PENDING_REVIEW` 유지) | Spotify 가사 탭, 발매 버전 확인 |

### 다른 앨범 (아직 점검 안 함)

`Blonde`, `IGOR`, `Lost Corner`, `MBDTF`의 기존 번역은 이번 점검 대상이 아니었다. 번역을 다시 읽다가 의심이 가는 줄이 나오면 위 형식으로 추가한다.

## 해결됨

| 곡 | 줄 | 쟁점 | 결론 | 근거 |
| --- | --- | --- | --- | --- |
| who-dat-boy | 38–39 | 'Summertime '06', 'before Vince' | 빈스 스테이플스의 2015년 앨범과 2006년 여름 회상 | Genius 주석 |
| who-dat-boy | 32 | 'bick' | 'big dick'. 라이터 Bic과의 말장난 가능성 | Genius 주석 |
| where-this-flower-blooms | 10 | 'Okaga' | 『Cherry Bomb』의 상상 속 장소 | Genius 주석 |
| where-this-flower-blooms | 29 | 'mall grip' | 스케이트보드를 움켜쥐는 방식, 가꾼 손톱 때문에 피함 | Genius 주석 |
| foreword | 33 | "will not let me be one"의 "one" | 경찰에게 희생되는 흑인 | Genius 주석 |
| pothole | 50 | 'four for four' | 『Bastard』 포함 이전 네 앨범의 연속 성공 | Genius 주석 |
| i-aint-got-time | 59–61 | Yoda / Skywalker / solar / Sprite / cola | 스타워즈 말장난 (요다는 초록 지폐, 솔라는 한 솔로) | Genius 주석 |
| bring-it-on-down | 22 | "their lives"인지 "your life"인지 | "their lives"로 확정 | Spotify 공식 가사 (사용자 확인) |
| rack-of-his | 36 | 고유명사(Orville)인지 'either well'인지 | 'either well'로 확정. 번역 유지 | Spotify 공식 가사 (사용자 확인) |
| rack-of-his | 8, 23, 29 | 'kick' | 재미로 읽음. 그 남자가 할 일이 없을 때를 싫어해 핑계가 있어야 곁에 있다는 문맥과 일치 | Genius 주석 (사용자 확인) |
| i-love-kanye | 1 | 'the 'Go' | 시카고('Go) 출신 그대로의 카녜. Go Getters도 겹침 | Genius 주석 (사용자 확인) |
| wolves | 39 | 'warm flesh, unseasoned' | 양념도 안 된 따뜻한 살코기. 'Caesar'가 아니었음 | Spotify 공식 가사 (사용자 확인) |
| wolves | 49 | 'that's the tea, no sip' | 'tea'=T(진실)와 케르밋 밈을 겹친 말장난 | Genius 주석 (사용자 확인) |
| wolves | 54–59 | 'corny' / 'unswallow' | 킴이 억지로 예의를 지키는 여성들, 'New Slaves'의 swallower와 연결. 번역 유지 | Genius 주석 (사용자 확인) |
| candy-paint | 8 | 'no jumper' | Gucci Mane 'Bricks'와 팟캐스트 No Jumper | Genius 주석 (사용자 확인) |
| candy-paint | 50 | 'rolling twenty ash' | 대마를 말아 피우고 길을 나서는 뜻으로 읽음 | 사용자 제공 해설 |
| cold | 38 | 'ice cube' 줄 표기 | 표기 확인, 보석 자랑 | Spotify 공식 가사, Genius 주석 |
| goodbyes | 30 | 'my argues possessive' | Spotify 표기에 맞춰 번역 수정 | Spotify 공식 가사 (사용자 확인) |
| i-cannot-be-a-sadder-song | 12 | 'top me off' | 술을 채움과 구강 성교 속어('top')의 중의일 수 있음(검수 안 된 주석) | Genius 주석 (사용자 확인) |
| i-cannot-be-a-sadder-song | 37 | 'federal skeleton on my wrist' | 스켈레톤 시계, 대통령 롤렉스 암시 | Genius 주석 (사용자 확인) |
| losers | 3 | 'Chuck's, Ern's, and Chandler's' | 대문자 표기, 이름 나열 | Spotify 공식 가사 (사용자 확인) |
| texas-tea | 12 | 'skeleton' | Richard Mille RM 052 해골 스켈레톤 시계 | Genius 주석 (사용자 확인) |
| texas-tea | 18–20 | 'ogling', 'yodeling', 'guillotine' | 'toggling'이 아니라 'ogling'. 번역 수정 | Spotify 공식 가사 (사용자 확인) |
| too-young | 15 | 'your life never going back' | 가난으로 돌아가지 않으려 침착하게 지냄. 번역 수정 | Genius 주석 (사용자 확인) |
| yours-truly-austin-post | 10 | 'put that sauce on' | 'sauce'=자기 방식·개성 (Hot Ones) | Genius 주석 (사용자 확인) |
| where-this-flower-blooms | 14–15, 38–39 | 'Simp sun' | simp=이성에게 쩔쩔매는 사람 | 사용자 확인 |
| who-dat-boy | 26–27 | 'neck chill' | 목에 건 보석 자랑 | Genius 주석 (사용자 확인) |
| foreword | 47–49 | 끝 구간의 화자 | 렉스 오렌지 카운티의 사색. 번역 유지 | Genius 주석 (사용자 확인) |
| see-you-again | 11 | '20/20 vision' | 정상 시력, 뒤 줄 큐피드와 이어짐 | Genius 주석 (사용자 확인) |
| boredom | 30 | "I'm not solved" | 'gay'가 올 법한 자리에 'bored'를 넣어 라임을 비튼 장치 | Genius 주석 (사용자 확인) |
| i-aint-got-time | 66, 69 | 스타워즈 줄, 'getting neck' 줄 | 스타워즈 말장난, 구강 성교·사정·9밀리 권총 | Genius 주석 (사용자 확인) |
| 911-mr-lonely | 75, 81, 95 | 'not Chicago', 'Saari', 정관수술 | wind/win 동음, 스케이트보더 Arto Saari와 영상 'Sorry', 후회와 'come'의 중의 | Genius 주석 (사용자 확인) |
| droppin-seeds | 6–8, 11 | C's / pansy / banshee / droppin' English | N.W.A 'Express Yourself' 인용, seeds와 C's 말장난 | Genius 주석 (사용자 확인) |
| november | 22, 32 | 'track seven', 'billy' | 7번 트랙=Garden Shed, 3·4번 트랙과 3+4=7 말장난, 'hold that billy'=돈을 쥠. 번역 수정 | Genius 주석 (사용자 확인) |
| glitter | 13, 14, 20, 33, 37 | 'uno peso', 'keep that buck', 4·5·7·8, L/DJ, skiptrace | 멕시코 통화, 돈을 지킴, 트랙 번호와 .45 권총 겹침, 블런트·패배/우울을 풀어 줄 DJ, Mild High Club 『Skiptracing』 10번 트랙. 번역 수정 | Genius 주석 (사용자 확인) |
| digsys-dinner | 3 | 'tea' | 북부 영국에서 저녁 식사를 가리킴. 번역 유지 | Genius 주석 (사용자 확인) |
| cigarettes-and-alcohol | 16, 19 | 'the white line', 'when it comes on top' | 코카인 줄. 번역 유지 | Genius 주석 (사용자 확인) |
| rock-n-roll-star | 7 근처 | 'feed my head' | 머릿속을 지식으로 채움. 번역 수정 | Genius 주석 (사용자 확인) |
| droppin-seeds | 노트 본문 | 곡 전체의 화자 | 릴 웨인. 노트 본문의 "끝의 타일러" 서술을 고침 | XXL 기사 |

## LRCLIB 가사와 Genius 가사가 다를 때

**Spotify 공식 가사**가 가장 우선하는 기준이다. 사용자가 Spotify 앱에서 직접 확인한 표기를 쓰고, 문서에는 "Spotify 공식 가사"로 출처를 적는다.

앱이 보여 주는 가사는 LRCLIB 레코드(`timing.lrclibId`)이고, 번역은 그 줄의 시간에 붙는다. Genius 가사는 해석의 근거 자료일 뿐 저장소에 옮기지 않는다. 둘 다 사람이 받아쓴 것이라 어느 쪽이 맞는지는 음원이 판단한다.

1. **차이의 종류를 나눈다.** (a) 철자·받아쓰기 차이, (b) 단어가 달라 뜻이 바뀌는 차이, (c) 줄 나눔·반복·섹션 차이.
2. **(a)는 번역에 영향이 없으면 기록만 한다.**
3. **(b)는 음원을 직접 듣거나 공식 가사 시트·라이너 노트·아티스트 발언으로 확인한다.** 확인이 안 되면 이 문서의 "미확정" 표에 올리고, 번역은 가장 근거가 강한 쪽을 택하되 `## 번역에 대하여`에 두 가지 읽기가 있음을 적는다 (두 판본의 단어는 몇 단어까지만 인용).
4. **(c)는 번역 구간에 영향을 준다.** 번역 구간(`startMs`)이 LRCLIB 줄 시작 ±400ms 안이어야 `lyrics:lines --check`를 통과한다. 다른 LRCLIB 레코드가 Genius 가사와 맞고 Spotify 녹음 길이가 ±3초 안이면 `--id`로 그 레코드를 골라 `timing`을 바꾸고 구간을 다시 맞춘다.
5. 어느 레코드가 맞든 **번역은 음원이 말하는 뜻**을 따른다. LRCLIB 줄이 명백한 오타면 앱의 원문 줄은 틀려 보이지만 번역은 맞는 뜻으로 쓰고 위 표에 기록한다.
6. Genius 가사나 LRCLIB 원문을 이 문서, 노트, 커밋 메시지에 옮기지 않는다.

차이를 발견하면 곡 키, 줄 번호, 어떤 종류(a/b/c)인지, 어느 쪽이 맞아 보이는지와 그 근거를 위 "미확정" 표에 한 줄 추가한다.
