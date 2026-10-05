# Smartphone feedback

Only the controller consumes this queue and event tracker. Inputs are confirmed server snapshots:
turnNumber/currentPlayerId, trade ID/status, lastTurnAction ID, lastBuildingAction ID and economyLog IDs.
Rent records identify payer first and recipient second (EconomyService); card-draw log IDs distinguish
repeated draws without playing card effects again. Initial snapshots seed historical records silently;
the current own turn and pending incoming offers are still announced. Repeated snapshots and reconnects
within the mounted controller do not replay notifications. A page reload starts a fresh session.

Normal toasts last 3.5 seconds, actionable offers 6 seconds, with 220 ms entry/exit.
One toast is visible, with up to six pending messages. Incoming offers take priority and interrupt
ordinary messages. Haptics fire once when a toast is shown. Pending offers retain a navigation
badge after dismissal. The toast's measured height reserves temporary header space, also while scrolling.
While visible, content is clipped below the toast so it cannot slide underneath it. The player's sticky
header and all navigation remain visible; ordinary document scrolling and the previous layout return
when the toast disappears.

The controller emits no audio. Own-turn, trade, purchase, build, coin, card and double feedback
remains visual, with optional haptics where configured. hapticsEnabled is stored in the existing
valenor:audio-settings:v1 record and uses browser feature detection; unsupported or blocked vibration
never blocks the UI. All music, board-game SFX and UI audio remain assigned to the board/TV role.
