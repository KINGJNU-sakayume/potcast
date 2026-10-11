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
| boredom | 79 | 끝 대사 'Ride's over…' | 이제 타는 건 끝났어 | 자동차인지 놀이기구인지 |

### Oasis 『Definitely Maybe』

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| shakermaker | 9 | "I'm sorry" 대목의 청자 | 사과하는 반말 | 노엘 인터뷰 |
| wolves | 30 | 'Don't fire fight': 'fight fire'의 도치인지, 'firefight'(총격전, 격한 말다툼)인지. Harvard Crimson은 이카로스 날개 줄만 짚음 (등급 D) | 불을 끄려 하지 마 | 아티스트 인터뷰, 줄 단위 주석 |
| too-young | 30 | 'got that bitch off'가 오르가즘에 이르게 했다는 뜻일 가능성 (Wiktionary 'get off', 다음 줄과 이어짐, 등급 C) | 그 여자를 보내고 ('보내다'의 중의로 유지) | 줄 단위 주석 |
| too-young | 26 | 'woe'가 플로리다·뉴올리언스 속어로 친구·일행이라는 정의 2건 (등급 C). 약물 은어는 근거 없음 | 약을 하고 | 아티스트 발언 |
| cold | 43–44 | 'aim three' 뜻 (등급 D) | 난 혼자 올라왔을 뿐이야 / 그건 내 잘못이었어 | 주석 |
| die-for-me | 37–45 | 퓨처 절: AZLyrics 표기는 Spotify와 같고 풀이 없음 (등급 D). 39 'passport', 41 'flying'은 문맥 추정 | 현재 번역 유지 | 주석 |
| goodbyes | 34 | 'on the charger' (등급 D). 28–29 'cut'은 성관계 중의 가능(Urban Dictionary 3건, 등급 C), 32–33은 저품질 해설 1곳(등급 C) | 직역 유지 | 주석 |
| candy-paint | 22 | 'Slide boy' (등급 D) | 미끄러지듯 내려와, 젠장, 난 뜨거워 | 주석 |
| boredom | 79 | 끝 대사: AZLyrics는 Shane Powers의 대사, Dissect는 라디오 소리로 받아 적음 (등급 D). 'Ride's over'가 맞는 표기인지부터 불확실 | 이제 타는 건 끝났어 | 음원 청취 |
| before-the-rise | — | 위키/MusicBrainz상 김나경이 부른 곡 (연주곡 아님). 가사 유무·언어는 미확정, LRCLIB에 가사 없음. MusicBrainz 작품에 작사 Jaden Jeong, 언어 'mul' (사용자 편집, 근거 약함) | 변경 없음 | Spotify 가사 탭, 공식 크레디트 |
| supersonic | 32 | "done it"의 뜻 (성관계 암시로 읽되 목적어를 흐려 둠) | 의사랑 그걸 했어 | 노엘 설명 (현재는 없음) |
| live-forever | — | "how your garden grows" (남의 일에 관심 없다는 뜻으로 읽는 해석) | 직역 | 노엘 설명 |

### Fiona Apple / Kanye West / Post Malone (재검토 라운드 1)

Genius 등 줄 단위 해설 사이트가 봇 접근 차단(403)이라 대부분 근거를 못 얻었다. 아래는 Genius 주석이나 Spotify 공식 가사 확인이 필요하다.

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| candy-paint | 22 | "Slide boy"의 속어 뜻 | 미끄러지듯 내려와, 젠장, 난 뜨거워 | 주석, 공식 가사 |
| cold | 43–44 | "aim three" 받아쓰기 (고유명사일 가능성) | 난 혼자 올라왔을 뿐이야 / 그건 내 잘못이었어 | Spotify 공식 가사 |
| die-for-me | 39 | "From your passport"의 뜻 | 네 여권을 보니 거짓말하는 것 같아 | Spotify 공식 가사 |
| die-for-me | 41 | "you flying"이 취했다는 뜻인지 비행기를 탔다는 뜻인지 | 넌 약해져서 날아갔지 | 주석 |
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

### Kanye West 전 앨범 (재검토 라운드 2)

등급은 C(단일 출처)와 D(문맥 추정)다. 이전 라운드와 마찬가지로 Genius 주석이나 음원 청취가 필요하다. 성적 은어를 순화한 줄은 노트의 "뜻만 남김" 방침이라 목록에서 뺐다.

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| heartless-kanye-west | 14 | 'get me back'이 앙갚음 관용구인지 재결합인지 (Wiktionary 'get someone back'=복수, 등급 C) | 날 되찾아서 본때를 보여 주겠다고 (어색, 복수 쪽 유력) | 줄 단위 주석 |
| amazing | 34–35 | 'no spoon'(은수저 읽기 D), 'summertime, no June' (각운용 줄, D) | 은수저 없이 / 여름인데 6월은 없어 | 주석 |
| say-you-will | 8 | 'Then play you will'의 play (D) | 그럼 그렇게 해 줘 | 주석 |
| robocop | 22, 24 | 'ain't take it to this degree' 주어·대상 (D), 'turn me on' 성적 뜻 가능(C) | 그녀는 이 정도까지 할 생각은 아니었대 / 끌어당겨 | 주석 |
| paranoid | 14–15 | 'make it hood', 'make you come…go' 중의 (D) | 거칠게 / 직역 | 주석 |
| pinocchio-story | 49, 52, 57–59 | 즉흥 가사라 엉킴. 49는 LRCLIB 'find' vs AZLyrics 'call' 불일치 | 그녀를 더는 찾을 수 없어 | 음원 청취 |
| see-you-in-my-nightmares | 48 | 'clouds in my vision'이 연기인지 (D) | 구름이 내 시야를 가려 | 주석 |
| bad-news | 16–18 | 'keep another' (D) | 직역 | 주석 |
| we-dont-care | 50 | 'homo / straight' 성적 말장난 (D) | 뒤틀린 것처럼 바로 펴지질 않지 | 주석 |
| slow-jamz | 17 | 'like Shyne home': 단수 'home' vs 'homes'(친구) (C) | 샤인이 집에 있을 때처럼 | 주석 |
| get-em-high | 23, 44–45, 78, 81, 91, 93 | Pastor Troy 'cut', Francis/W-H-I-T(Frank White?), 'You's a bitch… thicker', 'Marsha', 'Chimped up', 'Bolder than Denver'(Boulder?) (D) | 직역 | 주석 |
| through-the-wire | 1–2, 24, 26–27, 56 | 'Gee/Hop', 'two lifelines'(밀리어네어 라이프라인?), 자메이카 욕설 말장난, GEICO 줄 (D) | 직역 | 주석 |
| spaceship | 84–85, 98 | 'broad service'(bottle service?), 'A&Rs and they faculties', 'chariot'('Swing Low' 인용?) (D) | 방송 출연도 외 | 주석 |
| jesus-walks | 1 | 'Order, huh' (AZLyrics에 줄 없음, D) | 세워 총, 하 | 음원 청취 |
| breathe-in-breathe-out | 4, 47 | 'pull ya D's out' (D), 47번 LRCLIB 'hunnies where my Altima was' vs AZLyrics 'drive me in the hundreds' 불일치 | 돈을 꺼내 | 음원 청취 |
| school-spirit | 35 | 'young pootie tang tippy tow' (C/D) | 까치발 든 젊은 푸티 탱 | 주석 |
| all-falls-down | 20 | 'look like Eve' (D) | 직역 | 주석 |
| last-call | 49, 53 | 'sweeter than old Sadie', 'almost Raymond' (D). 용어집 'Hip Hop' 항목에 오타 의심(Kyambo, Bette Midler) | 직역 | 주석 |
| the-new-workout-plan | 48–49 | 'four door … five, six, seven, eight' (D) | 직역 | 주석 |
| heard-em-say | 4, 9, 10, 31 | 'hard way'→Tim Hardaway 말장난(해설 1곳, C. 승인 안 하면 되돌림), 'minister'(이슬람 인물?), 'throw him some hot cars', 'Aunt Pam'(이모/고모) (D) | 팀 하더웨이처럼 더 험한 길이지 외 | 주석 |
| touch-the-sky | 19, 60, 62 | 'Jacob'(보석상?), 'Who's on First'와 셋째 벌스, 맥주병 비유 (D) | 직역 | 주석 |
| gold-digger | 16–17, 46 | 'arm' 시계 추정, 'like Michael'(마이클 잭슨 성형?) (D) | 직역 | 주석 |
| drive-slow | 6, 21, 38, 53, 71 | 'school full of stones'(Black P. Stones?), 'Baby'=버드맨?, 'fifth relaxed', 'Just a Lil' Bit'(50센트, C), 'sold O's'(온스?) (D) | 직역 | 주석 |
| crack-music | 31, 42, 85 | 'Maddigan' 정치인, 'Moes and the Folks', 'trade hooks for Grammys'(hooks=후렴?) (D) | 직역 | 주석 |
| diamonds-from-sierra-leone | 15, 35–36, 49, 54, 65, 69 | 'kill my Vibe'(C), 'them/him' 표기, 'ya need to go down'(성적 속어?), 'with really doe' 표기 갈림 (D) | 직역 | 음원 청취 |
| diamonds-from-sierra-leone-remix | 48, 64–65, 80 | rain/reign back 표기, 'Kanyeez you got me', Young Gunz·Teairra Marí·Peedi(C), "I'm Young" (D) | 직역 | 음원 청취 |
| we-major | 57, 69 | 'Nas'가 호칭인지 예시인지, 'before I had the game took' (D) | 나스, 팬들은 여전히 Illmatic을 원해 외 | 주석 |
| gone | 6, 18, 23, 25, 53–54 | 'Numpsay', 'let it burn'(어셔 'Burn'?, C), 'Roc Pastelle', 'Doobie Long', 'Weezie/George/Regina' (D) | 직역 | 주석 |
| bring-me-down | 9, 33, 34–39 | LRCLIB 'last today' vs AZLyrics 'to Mass today', 'crosswinds' 표기, 브랜디 구간 받아쓰기 (D) | LRCLIB 표기 | 음원 청취 |
| my-way-home | 16 | LRCLIB 'stay in they corner like Mike Tyson' vs AZLyrics 'some wanna stay in their corner' | LRCLIB 표기 | 음원 청취 |
| roses | 전체 | `lyrics:lines --check roses` 실패: 번역 구간 시작이 LRCLIB 줄 시작과 400ms~2.2초 어긋남 (첫 임포트부터 있던 문제, 이번 수정과 무관). 다른 LRCLIB 레코드로 재매칭 필요 | — | 레코드 선택 |
| gorgeous | 10, 12, 38, 39, 77, 79 | '30 rocks…Alec Baldwin'(『30 Rock』 말장난, C), 'call of Autumn', "World's Game"(축구?), 'say hoe… pimpish', 'lived in lenses', 'one cuff'(바짓단?) (D) | 직역 | 주석 |
| power | 30 | 'my ice brought the goalies in' 연결 (D) | 내 다이아는 하키 골키퍼까지 불러들였지 | 주석 |
| monster | 31, 91 | 'Malibooyah', 'the funny face'(지폐 속 얼굴인지) (D) | 직역 | 주석 |
| so-appalled | 19, 84, 87, 89 | 'O's like Cheerios'(온스/오르가슴), 'Tony…nostrils'(토니는 누구), 'Bobby Brown jaw', 'legends of the falls' (D) | 직역 | 주석 |
| devil-in-a-new-dress | 37, 40 | 'ordered the jerk'(요리/사람 중의), 'Lyor Cohen' 표기 (D) | 직역 | 주석 |
| runaway | 56, 60 | 'Ichabod Crane with…top off', 'Freddy loafers' (D) | 직역 | 주석 |
| all-of-the-lights | 40 | 'I bumped my head' 관용구 여부 (D) | 머리를 부딪쳤지 | 주석 |
| who-will-survive-in-america | 7 | 'digging Paul Revere and Nat Turner as the good guys': dig=파헤치다/좋게 받아들이다 (C) | 파헤쳤다…좋은 사람들로 | 주석 |
| hell-of-a-life | 후렴, 65 | LRCLIB 'hell of a lie' vs AZLyrics 'hell of a life' (번역은 life 쪽) | 끝내주는 인생 | 음원 청취 |
| ultralight-beam | 43–47 | 표기 충돌: AZLyrics는 'You/Your'를 대문자로 적어 신에게 하는 말로 읽힘. 현재 브리프는 친구에게 하는 말(해체). 청자 해석을 바꿀지 판단 필요 | 널/네 이름 (해체) | 음원 청취, 크레디트 |
| ultralight-beam | 48–53 | 'Wesley and Spike'(Wesley Snipes, Spike Lee?), 'Pam/Gina'(『Martin』 인용?), 'Arthur…anteater', 'woo wap, the bam' (D) | 직역 | 주석 |
| famous | 37–66 | 'Bam Bam'=총소리(Songfacts, C) | 밤 밤 | 주석 |
| freestyle-4 | 17, 32, 40–41 | LRCLIB 'your side/side down' vs AZLyrics 'Versailles/slide down'(C). 현재 번역 "네 쪽에 갔던 놈들"은 뜻이 안 통함. 'wipe me down', 'if she ghetto' (D) | 직역 | 음원 청취 |
| real-friends | 49, 62 | LRCLIB 'real end' vs AZLyrics 'reel end'(말장난?). 노트북 영상은 성관계 영상으로 읽음(ET, C) | 정말 끝까지 | 음원 청취 |
| franks-track | 4 | LRCLIB 'I'll mix now fleshed out' vs AZLyrics 'I'm mixed now, fleshed out' (C) | 직역 | 음원 청취 |
| no-more-parties-in-la | 18, 20, 38, 49, 109, 118 | 'grape van', 'Erykah Badu me', 'malpractice', 'union fee', 'bald fade, I might slam' (D), 'turbo thots'(C) | 직역 | 주석 |
| pt-2 (father-stretch-my-hands-pt-2) | 31, 32, 34, 45 | 'Pockets swole, Danny', 'Selling bar, candy', 'choppa go Oscar for Grammy', 'Wake up Versace' (D) | 직역 | 주석 |
| 30-hours | 30, 42, 44–46 | 'all the Popeye's is finished', 돛 비유 줄 (D) | 전부 먹고 없네 외 | 주석 |
| highlights | 44 | 'Impregnate Bridget' (D) | 직역 | 주석 |
| facts-charlie-heat-version | 12, 13, 21 | 'Herzog and Adidas'(Herzogenaurach?), 'Drizzy' 지칭 (D) | 직역 | 주석 |
| feedback | 27–28, 45 | 'Follow our father / You borrow our motto' (D), 45번 어색한 어미 | 직역 | 주석 |
| silver-surfer-intermission | 13 | 'loopy' (D) | 멋지게 | 주석 |
| fml | 31, 35 | 인용부호 안의 'ho' 위치, 'Giuseppe store'(Zanotti?) (D) | 직역 | 주석 |
| blood-on-the-leaves | 47 | `'nolia`=New Orleans Magnolia 단지(C-Murder 인용)인지 (C). "시절"은 덧붙임 | 매그놀리아 시절로 돌아가야겠어 | 주석 |
| guilt-trip | 7, 9, 17, 19, 20 | 'dem a gwaan'(떠들어 대 vs 행동하다), 'Blocka' 총소리(C), 샤카 말장난 (D) | 직역 | 주석 |
| new-slaves | 36, 61–63, 75–78 | 'pussy ain't free'의 일반화, 순화로 뜻이 달라진 줄, 헝가리어 Omega 인용 'Ő'의 주어(해인지 소녀인지) (D) | 세상에 공짜는 없다 외 | 주석, 영어 번역 |
| i-am-a-god | 1–4, 7, 33 | 'Blazin', 카플턴 샘플 'bugah red'(받아쓰기 의심), 'Ibn diamond'=이발사 Ibn Jasper(C) | 직역 | 주석 |
| im-in-it | 5, 40, 49, 71, 81 | 'Careless whispers', 'reptile', 'Michael Douglas out the car'(Falling Down?) (D), 순화된 성적 표현 | 직역 | 주석 |
| bound-2 | 17, 40 | 지하실 나이트클럽 비유, 'their backstroke' (D) | 직역 | 주석 |
| hold-my-liquor | 26–27, 40 | 'call 2Pac over', 'Late night organ donor' (D) | 직역 | 주석 |
| black-skinhead | 19–20 | '300 Romans'(스파르타인 혼동?), 'Trojans'(콘돔 중의?) (C) | 300퍼센트 진짜야, 로마인들처럼 / 트로전은 어디 있지 | 주석 |
| on-sight | 8, 29–31 | 'Indian hair', 퐁텐블로 호텔·David Grutman 줄 (D) | 직역 | 주석 |
| cant-tell-me-nothing | 17 | LRCLIB 'go to Hell' vs AZLyrics 'Hillman'(코스비 가족·힐먼 대학이 더 자연스러움, C) | 코스비 가족도 아니고, 지옥에 간 것도 아니야 | 음원 청취 |
| the-glory | 15, 22, 43 | 'Barkers/Parkers' 대상(D), 'Yayo'=코카인 속어?(C), LRCLIB 'two-door' vs AZLyrics 'Tudor'(C) | 직역 | 음원 청취 |
| stronger | 21, 32 | 'Christian in Christian Dior' 말장난, 'take six'(Take 6 그룹, D) | 직역 | 주석 |
| flashing-lights | 17, 42 | 'ol-wu-wopte' 의성어(D), roam/Rome without Caesar 동음(C: AZ roam, LyricsMode Rome) | 직역 | 주석 |
| barry-bonds | 25, 45, 51 | 'model head'(성적 속어?), 'Reagans' 지폐 단정(근거 없음), 'col' like Keyshia's family' (C/D) | 직역 | 주석 |
| champion | 19–20 | 'the rich ones' 대상 (D) | 부자로 나오는 영화 말고 | 주석 |
| good-life | 40 | 'boozed like she bombed at Apollo'(booed 말장난?) (D) | 직역 | 주석 |
| homecoming | 13 | LRCLIB 'tow' vs AZLyrics 'toe' (D) | 기를 꺾어 놨어 | 음원 청취 |
| good-morning | 10 | 'Rosie Perez' (D) | 직역 | 주석 |

### 수위·비하어 방침에서 사용자 결정이 필요한 곳

2026-10-11 결정("성적 은어와 욕설은 최대한 원문 수위대로")에 따라 영어 곡 전체의 욕설·성적 어휘를 원문 수위로 되돌렸다. 아래는 이 방침만으로 정할 수 없어 남긴 항목이다.

| 항목 | 현재 처리 | 결정할 것 |
| --- | --- | --- |
| 'nigga' 계열 | 기능별로 호명 '야/임마/새끼', 3인칭 '놈/새끼'. 곡마다 노트의 pronouns 규칙이 달라 '내 사람들', '친구'로 풀어 둔 곳도 있다 (we-dont-care, family-business, last-call, starboy, reminder 등) | 한국어 비하어로 강도를 맞출지, 기능 번역을 앨범 전체에 통일할지 |
| 인종 비하어의 한국어 대응 | 'Black Skinhead' 2줄('coon'을 옮긴 줄)과 'Heard 'Em Say' 1줄은 한국어 인종 비하어로 옮겼다가, 사용자 확인 전이라 기능만 옮기는 표현('그 광대 짓거리', '흑인 티')으로 되돌려 두었다 | 한국어 비하어로 원문 강도를 맞출지 결정 |
| 'fuck you/them' | 대부분 '좆까'로 통일, 일부 '엿 먹어' | 한 가지로 통일할지 |
| 'bitch'(문장 끝 추임새) | '썅', 호명은 '이년아'/'년' | 호칭 기능별 분리가 맞는지 |
| 'Ultralight Beam' 43–47 | 청자를 친구로 읽음. AZLyrics는 신에게 하는 말로 읽히는 대문자 표기 | 청자 해석 |
| '30 Hours' 49–99 | 즉흥 대화 구간이 번역 구간 없이 기계 번역으로 처리됨 (노트에 의도로 적혀 있음) | 이 구간도 번역할지 |
| 'No More Parties in LA' 34 | 'yam' 은어를 '엉덩이'로 옮김. 의미 미확인 | 의미 확인 |

### tripleS 『ASSEMBLE』 / NMIXX 『Blue Valentine』

| 곡 | 줄 | 쟁점 | 현재 처리 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| chowall | 1–2, 13–14 | 'la-la' 허밍 줄에 '라라라'를 번역으로 적은 처리가 앱에서 어떻게 보이는지 | 소리만 적음 | 앱 화면 확인 |
| chowall | 5–12 | "All hands on deck"의 관용구 뉘앙스 (전원 출동) | 모두 갑판으로 | 인터뷰, 컨셉 설명 |
| crush-on-you | — | 한국어 곡으로 판단했으나 LRCLIB 레코드가 로마자 표기본이라 한글 줄 비율로 판별하지 못함 | `lyricsLanguage: ko` (노트 본문 900자 미달로 `PENDING_REVIEW` 유지) | Spotify 가사 탭에서 한글 비율 확인 |
| adore-u | — | 한국어 줄 약 59%로 경계(40~60%)에 걸침. 영어 훅 비중이 큼 | `lyricsLanguage: ko` (본문 900자 미달로 `PENDING_REVIEW` 유지) | Spotify 가사 탭, 발매 버전 확인 |

### 다른 앨범 (아직 점검 안 함)

`Blonde`, `IGOR`, `Lost Corner`, `MBDTF`의 기존 번역은 이번 점검 대상이 아니었다. 번역을 다시 읽다가 의심이 가는 줄이 나오면 위 형식으로 추가한다.


### 가사 표기 불일치 기록 (LRCLIB / Spotify / 가사 사이트)

앱에 뜨는 줄(LRCLIB)과 번역이 어긋나 보일 수 있는 곳이다. 음원을 직접 듣고 최종 확인해 주시면 번역을 확정하거나 되돌린다.

| 곡 | 줄 | 표기 A | 표기 B | 현재 번역이 따르는 쪽 | 근거 |
| --- | --- | --- | --- | --- | --- |
| garden-shed | 39–40 | Spotify: 'base 10' | AZLyrics, Dissect: 'beige tan' / 'polka dot nose' | beige tan (밝은 살결, 주근깨 코) | 사용자가 준 주석 "타일러가 주근깨를 매력적으로 본다"와 40번 줄이 맞음. Spotify 표기와 다르므로 확인 필요 |
| cold | 41 | LRCLIB: 'don't gather hearts too' | AZLyrics, LyricsMode: 'don't got the heart to' | 'got the heart to' (그럴 마음도 없고) | 두 사이트 일치 |
| boredom | 41 | LRCLIB: 'fall this morning' | AZLyrics, Dissect: 'since before this morning' | since before | 두 곳 일치 |
| who-dat-boy | 52 | LRCLIB: 'push weight' | AZLyrics: 'push wheel' | push wheel (차를 몬다) | 후렴 두 번 모두 wheel |
| yours-truly-austin-post | 25 | Spotify: 'bought out' | AZLyrics, LyricsMode: 'balled out' | 번역 변경 없음(미확정) | 뜻 풀이 없음 |
| yours-truly-austin-post | 29 | AZLyrics: 'a light like kerosene' | LyricsMode: 'a lot of kerosene' | 번역 변경 없음(미확정) | 표기가 갈림 |
| goodbyes | 30 | Spotify: 'My argues possessive' | ogefash.reviews: 'My heart get possessive' | Spotify | 사용자 확인 |
| rack-of-his | 36 | 일부 전사본: 'Orville' | Spotify: 'either well' | either well | 사용자 확인 (해결됨) |

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
| garden-shed | 39–40 | 'base 10' / 'Polka dot' | 'beige tan'(밝은 살결)과 'polka dot nose'(주근깨 코). 위 표기 불일치 표 참고 | AZLyrics, Dissect, 사용자 주석 |
| pothole | 15 | 'you off it' | 약에 빠져 정신이 나갔다는 뜻 (Xanax 문제가 있던 친구 이야기) | Dissect 방송 |
| boredom | 41 | 'fall this morning' | 'since before this morning'. 번역 수정 | AZLyrics, Dissect |
| i-aint-got-time | 59–60 | 'keep sporting' | 'All Smiles Over Here'는 The Garden의 노래 제목(2015 『Haha』) | Dissect, Wikipedia |
| who-dat-boy | 52 | 'push weight' | 'push wheel'(차). 번역 수정 | AZLyrics, Dissect |
| cold | 41 | 'don't gather hearts too' | 'don't got the heart to'. 번역 수정 | AZLyrics, LyricsMode |
| die-for-me | 36 | 'bad girl' | 반항적인 성향이 매력인 여자. "나쁜 여자"로 되돌림 | Wiktionary, Urban Dictionary |
| take-what-you-want | 43, 45 | 'pipe', 'went bad' | 크랙을 피우고 화자 친구들과 잠자리를 갖는다는 풀이. 번역 수정 | Songfacts |
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
