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
| where-this-flower-blooms | 14–15, 38–39 | 'Simp'를 연인으로 읽는 해석 | OJ 햇살 / 심프-선(OJ 심슨) | 한 사람의 Genius 주석에만 의존. 추가 출처 필요 |
| who-dat-boy | 52 | 'push weight'가 마약 유통인지 어머니가 말한 몸무게와 겹친 말장난인지 | 큰 물량을 굴려서 | Genius 주석 |
| who-dat-boy | 26–27 | 'neck chill' / 'push wheel' | 목에 얼음이 / 차를 이렇게 몰아서 | 다이섹트 방송 한 곳에만 의존 |
| pothole | 15 | 'you off it'이 약물과 이어지는지 | 네가 완전히 맛이 갔다 | Genius 주석 |
| foreword | 47–49 | 마지막 "don't come back"의 청자. 렉스 오렌지 카운티의 구간으로 읽는 주석은 있으나 청자는 확정 안 됨 | 돌아오지 마라 | Genius 주석, 인터뷰 |
| see-you-again | 11, 35–37 | '20/20 vision', 'look both ways' 등 숙어 | 직역에 가깝게 | 숙어 설명 |
| garden-shed | 39 | Spotify 공식 가사는 "base 10"(bass 아님)으로 확정. 십진법을 뜻하는 말이 이 자리에서 무엇을 가리키는지는 해설을 못 찾음 | 베이스 10(base 10)의 열렬한 팬이었고 | Genius 주석, 인터뷰 |
| garden-shed | 40 | 'Polka dot' | 직역 | Genius 주석 |
| boredom | 30 | "I'm not solved" 말장난 여부 | 난 아직 안 풀렸고 | Genius 주석 |
| boredom | 41 | 'fall this morning' | 무너져 내려 | Genius 주석 |
| boredom | 79 | 끝 대사 'Ride's over…' | 이제 타는 건 끝났어 | 자동차인지 놀이기구인지 |
| i-aint-got-time | 59(번역 60) | 'keep sporting'이 착용인지 뒤 줄과 이어지는 말인지 | 이대로 입고 다닐 거야 | Genius 주석 |
| i-aint-got-time | 66 | 'Skywalker'가 타일러의 차인지 (주석도 "probably") | 스카이워커 같은 차로 솔라(한 솔로) 둘레를 쏘다니는 중이야 | 인터뷰 |
| i-aint-got-time | 69 | 총기 은어 줄의 중의성 | 터질 때까지 | Genius 주석 |
| 911-mr-lonely | 75 | 'not Chicago'가 팀(Bulls, Cubs)을 가리키는지 | 직역 | Genius 주석 |
| 911-mr-lonely | 81 | Saari / sorry 말장난 | 사리(Saari)야 | Genius 주석 (Arto Saari는 핀란드 스케이트보더) |
| 911-mr-lonely | 95 | 정관수술 비유가 무엇을 가리키는지 | 정관수술 받은 것처럼 말이야 | Genius 주석 |
| droppin-seeds | 6–8 | 'C's like classes', pansy, banshee의 부가 의미 | 수강 취소하듯 C(씨)를 떨구고 … | Genius 주석 |
| droppin-seeds | 11 | "droppin' English" | 난 영어를 떨궈 | Genius 주석 |
| november | 22 | 'track seven'은 'Garden Shed'로 확인. 문장이 가정문인지 | 서넛만 남으면 어떡해 | Genius 주석 |
| november | 32 | 'billy'가 무엇인지 | 그 빌리를 붙들어 | Genius 주석 |
| glitter | 13 | 'uno peso' | 한 푼짜리 인생 | Genius 주석. 현재 번역은 근거 없는 의역으로 보임 |
| glitter | 14 | 'keep that buck' | 솔직하게 가 | Genius 주석 |
| glitter | 20 | 트랙 번호(4·5·7·8)인지 총기 구경인지 | 번호로 읽는 안과 총기로 읽는 안이 모두 가능 | Genius 주석 |
| glitter | 33 | 'L' / 'DJ' 말놀이 | L(패배)이 아니니까, DJ일 수도 있겠네 | Genius 주석 |
| glitter | 37 | 'skiptrace'가 10번 트랙과 겹치는 말놀이인지 | 잠적자 추적(스킵트레이스) | Genius 주석 |
| (주근깨 주석) | — | 사용자가 준 주석 중 "타일러가 주근깨를 매력적으로 본다"는 줄이 어느 곡인지 모름 | — | 곡과 줄 확인 후 반영 |

### Oasis 『Definitely Maybe』

| 곡 | 줄 | 쟁점 | 현재 번역 | 필요한 근거 |
| --- | --- | --- | --- | --- |
| digsys-dinner | 3, 14, 21 | 'tea'를 저녁 식사로 읽었는데 세 시 반 픽업과 시간이 어긋남 | 밥 먹으러 | 노엘 인터뷰, 영국 속어 사전 |
| cigarettes-and-alcohol | 5, 16, 19 | 'the white line'을 코카인으로 읽은 근거가 평론 블로그 수준. 'when it comes on top'은 사전에서 못 찾음 | 코카인 한 줄이나 하는 | 노엘 인터뷰, Green's Dictionary |
| shakermaker | 9 | "I'm sorry" 대목의 청자 | 사과하는 반말 | 노엘 인터뷰 |
| supersonic | 32 | "done it"의 뜻 (성관계 암시로 읽되 목적어를 흐려 둠) | 의사랑 그걸 했어 | 노엘 설명 (현재는 없음) |
| rock-n-roll-star | 7, 21 | 'feed my head'의 뜻 (White Rabbit에서 왔다는 설은 입증 못 함) | 직역 | 노엘 인터뷰 |
| live-forever | — | "how your garden grows" (남의 일에 관심 없다는 뜻으로 읽는 해석) | 직역 | 노엘 설명 |

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
