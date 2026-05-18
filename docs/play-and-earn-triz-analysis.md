# Трансформация Elmental из stake-PvP в Play-and-Earn

Дата: 2026-05-18  
Ревизия репозитория: `97bf6c9`

## Короткий вывод

Текущую paid-механику нельзя безопасно "переименовать" в Play-to-Earn. Сейчас в продукте есть платный баланс `paid_elm`, покупка через Telegram Stars, матч со stake, winner payout из общего пула и rake 5%. В сочетании с одновременным выбором ходов, hidden information, Chaos regen и overclock randomization это выглядит как gambling-like конструкция: пользователь платит, рискует балансом и может выиграть баланс другого пользователя.

Для текущей фазы рациональнее перейти не в прямой Play-to-Earn, а в Play-and-Earn:

- paid ELM остается покупаемым через Stars и тратится как match credit / entry fee;
- победитель не получает paid ELM проигравшего;
- за игру начисляются non-refundable Season Points, рейтинг, достижения и, опционально, non-refundable bonus ELM;
- обратная конвертация в Stars разрешена только для неиспользованного paid ELM из покупных лотов;
- вся экономика пишется в append-only ledger, чтобы во второй фазе можно было добавить турниры, сезоны, косметику или sponsored rewards без переписывания базового учета.

Это менее "жирная" экономика, чем P2E с cash-out, но она намного проще для production-ready запуска и оставляет пространство для усложнения механики.

## Не юридическое заключение

Этот документ не является legal memo. Gambling, skill contest, sweepstakes, виртуальные валюты, Telegram Stars, app store policies и token rewards зависят от юрисдикции и формулировок продукта. Перед платными призами, cash-out, token rewards или турнирами с призовым фондом нужен юрист.

Практический смысл анализа: убрать из текущей версии самые очевидные gambling-like признаки и не строить фазу 1 на механике, которую потом придется срочно демонтировать.

## Текущее состояние

В коде уже есть сильная основа:

- SpacetimeDB является authoritative backend для matchmaking, commit/reveal, round resolution, settlement и balances.
- Telegram-пользователи используют `paid_elm`; web-пользователи используют demo `tELM`.
- Покупка Stars сейчас дает ELM по стабильному курсу: `1 XTR -> 100 ELM`.
- Минимальный stake матча сейчас `50`.
- Матч резервирует stake у обоих игроков.
- Winner payout считается как `stake * 2 - rake`; rake равен 5%.
- При draw игроки получают stake refund minus per-player rake.
- Energy Boost добавляет 20 energy за 10% stake и возвращается только победителю или при draw.

Сильная сторона: game loop уже серверный, тестируемый и наблюдаемый через events.

Слабая сторона: paid outcome прямо зависит от результата PvP-матча. Это и есть главная gambling-like точка.

## Почему текущая механика рискованна

Технически игра не является чистым RNG: есть energy economy, матрица 6x6, hidden energy, commit/reveal, рейтинг и повторяемый skill edge. Но для риска этого недостаточно. Во многих юрисдикциях критичны не только "случайность", но и сочетание оплаты, приза и неопределенного результата.

У текущей модели есть все продуктовые сигналы, которые лучше не тащить в production paid-фазу:

- пользователь покупает paid ELM за Stars;
- paid ELM можно поставить в матч;
- выигрыш paid ELM зависит от исхода матча;
- проигравший теряет paid ELM;
- система берет rake;
- есть режимы и механики с variance: Chaos и overclock;
- README все еще продает идею как "real stakes" и "poker with elements".

Даже если матч skill-based over 100 games, отдельный paid match выглядит как wager. Поэтому direct Play-to-Earn только усилит риск.

## Варианты

Оценка: 1 плохо, 5 хорошо. Критерии для текущей фазы: простота реализации, интерес пользователя, снижение gambling-like риска, production readiness, расширяемость для фазы 2.

| Вариант | Простота | Интерес | Риск | Production readiness | Фаза 2 | Вывод |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A. Оставить stake-pool и назвать P2E | 5 | 4 | 1 | 2 | 2 | Не делать. Это прежняя gambling-like модель с другим названием. |
| B. Полностью demo-only tELM | 5 | 2 | 5 | 4 | 3 | Безопасно, но слабый retention и мало причин платить. |
| C. Entry fee + Season Points Play-and-Earn | 4 | 4 | 4 | 5 | 5 | Рекомендуемый вариант для фазы 1. |
| D. Sponsored skill tournaments | 2 | 5 | 3 | 3 | 4 | Только фаза 2 после legal review и антиабуза. |
| E. Blockchain/token cash-out P2E | 1 | 4 | 1 | 1 | 2 | Не подходит текущей фазе. |

Рекомендация: вариант C.

## Рекомендуемая модель фазы 1

### 1. Заменить stake на entry fee

Матч больше не должен быть "оба поставили, победитель забрал пул". Он должен быть "оба оплатили доступ к ranked match".

Текущие `50 ELM` становятся entry fee. Списание происходит при создании матча или при входе в queue с надежной отменой/timeout refund policy. После settlement:

- победитель не получает paid ELM проигравшего;
- проигравший не платит победителю;
- draw не обязан возвращать stake как gambling refund;
- rake исчезает из пользовательского языка и settlement math;
- система показывает пользователю "Entry fee spent" вместо "Stake / Payout / Rake".

Если нужна мягкость на раннем этапе, можно сделать:

- first daily ranked match free;
- draw возвращает часть entry fee как user-friendly policy, но не как prize pool;
- disconnect refund только по техническим правилам.

### 2. Ввести Season Points

Season Points не являются валютой, не покупаются, не продаются и не конвертируются в Stars. Они нужны для интереса и прогресса.

Базовое начисление:

| Результат | Season Points |
| --- | ---: |
| Win | +30 |
| Draw | +15 |
| Loss | +10 |
| Clean win 3:0 | +5 bonus |
| First win of day | +20 bonus |

Важно: это не loot box и не случайная награда. Награда должна быть детерминированной, объяснимой и тестируемой.

### 3. Разделить paid, bonus и season state

Минимальная модель:

- `paid_elm`: куплено за Stars, можно потратить на entry fee, можно вернуть в Stars только если не использовано;
- `bonus_elm`: non-refundable промо-кредиты, можно потратить на entry fee, нельзя вернуть в Stars;
- `season_points`: score/progression, нельзя тратить и нельзя вернуть;
- `tELM`: demo web balance, без связи с paid rewards.

Если хочется сократить scope, `bonus_elm` можно отложить. Но `season_points` нужно добавить сразу, иначе "earn" снова потянется к paid ELM.

### 4. Сохранить обратную конвертацию только для неиспользованного paid ELM

Текущий refund-путь полезен, но его надо продуктово ограничить:

- refundable только paid ELM из покупных Stars lots;
- потраченный entry fee не refundable, если матч был предоставлен;
- earned Season Points не refundable;
- bonus ELM не refundable;
- refund UI должен показывать "Refund unused purchased ELM", а не "convert earned ELM back to Stars".

Это критично. Если earned rewards можно конвертировать назад в Stars, модель снова становится призовой.

### 5. Оставить gameplay почти без изменений

Матрица, energy, enhanced moves, commit/reveal, hidden information, rating и modes могут остаться. Меняется не игра, а settlement.

Для текущей фазы это лучший компромисс: пользователь по-прежнему играет напряженный PvP, но outcome больше не является user-to-user monetary transfer.

## TRIZ-разбор

### Идеальный конечный результат

Пользователь чувствует прогресс, риск и соревновательность, но система не переводит деньги от проигравшего к победителю. Балансы контролируемы, refund понятен, а вторая фаза может добавить более сложные rewards без переписывания core gameplay.

### Противоречие 1: нужны ставки, но нельзя делать wager

Пользовательский интерес растет, когда исход матча имеет последствия. Но paid stake + winner payout создает gambling-like риск.

TRIZ-принципы:

- **2. Вынесение**: вынести monetary prize из settlement.
- **24. Посредник**: заменить payout промежуточным слоем `season_points`.
- **35. Изменение параметров**: заменить stake на entry fee.

Решение: игрок платит за участие, но за победу получает progression, а не paid balance проигравшего.

### Противоречие 2: нужен Play-to-Earn интерес, но cash-out опасен

Если игрок ничего не получает, retention слабее. Если получает redeemable value, риск резко растет.

TRIZ-принципы:

- **10. Предварительное действие**: сейчас строим reward ledger и seasons, но не включаем cash-out.
- **15. Динамичность**: future rewards подключаются через config и policy gates.
- **26. Копирование**: web-версия продолжает использовать tELM как безопасную копию paid flow.

Решение: Play-and-Earn через points, rating, achievements, cosmetics и seasonal status. Cash rewards не включать в фазе 1.

### Противоречие 3: нужна простая реализация, но production-ready учет

Самое простое изменение - поменять пару формул payout. Но production-ready paid app требует аудита, idempotency и восстановимости.

TRIZ-принципы:

- **1. Дробление**: отделить gameplay events от financial ledger.
- **23. Обратная связь**: каждый debit/credit должен иметь reason, match id и idempotency key.
- **11. Предварительная защита**: refund, admin adjustment и recovery проектировать до роста пользователей.

Решение: не добавлять сложную механику, пока нет append-only `account_balance_events`.

### Противоречие 4: нужно усложнить механику во второй фазе, но не сломать первую

Если сейчас зашить reward rules прямо в settlement, каждая новая фича будет лезть в paid balance.

TRIZ-принципы:

- **3. Локальное качество**: разные ledgers для paid balance, bonus credits, season points и match state.
- **6. Универсальность**: один reward engine должен обслуживать wins, quests, seasons и future tournaments.
- **5. Объединение**: результат матча должен порождать одно событие, из которого строятся wallet history, season progress и admin analytics.

Решение: settlement завершает матч, reward engine начисляет non-cash progression по событию settlement.

## Минимальная реализация

### Backend

1. Добавить server config:
   - `ECONOMY_MODEL=stake_pool|entry_fee_season_points`;
   - по умолчанию для production использовать `entry_fee_season_points`;
   - старый `stake_pool` оставить только для локальных legacy/smoke сценариев, если нужно.

2. Добавить таблицу или поля:
   - `account.season_points`;
   - опционально `account.bonus_balance`;
   - append-only `account_balance_event` для paid/bonus balance operations.

3. Изменить settlement:
   - при match creation списывать entry fee;
   - при win/loss/draw не начислять winner payout из пула;
   - начислять `season_points` по детерминированной формуле;
   - boost либо убрать из paid-фазы, либо сделать non-refundable match modifier с очень ясным UI.

4. Обновить refund logic:
   - refund считает только unused paid ELM lots;
   - spent entry fee уменьшает refundable amount;
   - earned points и bonus credits не участвуют.

5. Добавить ledger/idempotency:
   - `payment_id`, `match_id`, `event_kind`, `delta`, `balance_kind`, `created_at`;
   - unique idempotency key для каждого debit/credit;
   - admin adjustment только через отдельный audited path.

### Frontend

1. Переименовать economy copy:
   - `Stake` -> `Entry Fee`;
   - `Winner Payout` -> убрать;
   - `Rake` -> убрать из пользовательского результата;
   - `ELM Change` -> `ELM Spent` для paid balance;
   - добавить `Season Points +N`.

2. Home:
   - показывать paid ELM как match credits;
   - показывать Season Points отдельно от баланса;
   - refund CTA назвать `Refund unused ELM`.

3. Result:
   - показывать outcome, rating change, season points;
   - не показывать "total pool", "winner payout", "rake".

4. Wallet history:
   - `stars_purchase`;
   - `match_entry_fee`;
   - `stars_refund`;
   - `bonus_credit` если вводим bonus ELM;
   - season history отдельно от wallet history.

### Tests

Минимальные тесты перед production:

- paid match списывает entry fee у обоих игроков;
- winner не получает paid ELM проигравшего;
- loser не теряет больше entry fee;
- draw не создает payout pool;
- Season Points начисляются win/draw/loss детерминированно;
- refund возвращает только unspent purchased ELM;
- bonus/season rewards не refundable;
- web tELM остается demo-only;
- admin adjustment пишет audit row;
- wallet history не смешивает paid balance и season progression.

## Product UX

Тексты должны перестать обещать "real stakes", "winner takes pool", "earn money", "cash out" или "poker with money". Для текущей фазы безопаснее:

- "Play ranked matches";
- "Spend ELM match credits";
- "Earn Season Points";
- "Climb the leaderboard";
- "Unlock cosmetics / titles";
- "Refund unused purchased ELM".

Плохие формулировки:

- "Bet ELM";
- "Win opponent's ELM";
- "Earn Stars";
- "Cash out";
- "Rake";
- "Jackpot";
- "Deflationary burn" в paid UX.

## Как создать интерес без winner payout

Пользовательский интерес не обязан держаться на cash prize. Для фазы 1 достаточно трех петель:

1. **Skill loop**: быстрый PvP, hidden information, energy reads, rating.
2. **Progress loop**: Season Points, daily first win, streak, league tiers.
3. **Collection loop**: cosmetics, card frames, titles, profile badges.

Минимальная версия collection loop может быть вообще без инвентаря: tier label на профиле и leaderboard. Потом можно добавить cosmetics.

## Что можно оставить на фазу 2

Фаза 2 должна начинаться только после production-ready учета и legal review.

Допустимые направления:

- sponsored tournaments with no purchase necessary;
- seasonal leaderboard rewards funded не из entry fees;
- non-transferable cosmetics;
- creator/community events;
- advanced ranked seasons;
- paid battle pass with deterministic rewards;
- on-chain proof of season result без cash-out.

Опасные направления:

- player-funded prize pool;
- cash-out earned ELM to Stars;
- token rewards with secondary-market expectation;
- paid randomized loot boxes;
- betting on matches;
- rake from PvP wagers;
- "losses fund winners" messaging.

## Production-ready gates

Перед тем как считать paid Play-and-Earn production-ready, должны быть закрыты эти gates:

1. **Ledger**: every paid/bonus balance mutation is append-only and idempotent.
2. **Refund**: unused paid ELM refund воспроизводим из ledger, а не из текущего balance snapshot.
3. **Admin**: все ручные операции audited с Telegram admin id и reason.
4. **Observability**: dashboard показывает purchases, refunds, entry fees, failed payments, active matches, settlement errors.
5. **Recovery**: есть проверенный restore drill и runbook "пользователь оплатил, но баланс не обновился".
6. **Copy review**: UI и README не обещают wagers, cash-out или investment return.
7. **Config safety**: production не может случайно включить `stake_pool`.
8. **Abuse controls**: rate limits, duplicate match protection, collusion detection basics, suspicious refund flags.

## Итоговое решение

Для текущей фазы нужно строить Play-and-Earn, а не Play-to-Earn.

Самый практичный вариант:

1. Paid Stars -> ELM остается как покупка match credits.
2. Match uses entry fee, not stake pool.
3. Winner earns Season Points/rating/status, not opponent's paid ELM.
4. Refund applies only to unused purchased ELM.
5. Backend получает append-only ledger и reward events.
6. Phase 2 добавляет seasons, cosmetics и sponsored rewards через отдельный reward engine.

Так мы сохраняем интерес: PvP, рейтинг, прогресс, сезонные цели. Но убираем главный риск: paid user-to-user wager with rake.

## Источники и ограничения платформы

- Telegram Stars docs: https://core.telegram.org/bots/payments-stars
- Telegram Stars announcement: https://telegram.org/blog/telegram-stars
- Telegram Stars Terms: https://telegram.org/tos/stars
- Telegram Mini Apps Terms: https://telegram.org/tos/mini-apps

Из этих документов для нас важны практические выводы: digital goods inside Telegram должны продаваться через Stars; bot должен доставить обещанный digital good после успешного платежа; разработчик может делать refund Stars payment; пользовательские Stars в Telegram не надо трактовать как свободно переводимую или выводимую валюту.
