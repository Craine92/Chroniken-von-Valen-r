# Smartphone feedback

Only the controller consumes this queue and event tracker. Inputs are confirmed server snapshots:
turnNumber/currentPlayerId, trade ID/status, lastTurnAction ID, lastBuildingAction ID and economyLog IDs.
Rent records identify payer first and recipient second (EconomyService); card-draw log IDs distinguish
repeated draws without playing card effects again. Initial snapshots seed historical records silently;
the current own turn and pending incoming offers are still announced. Repeated snapshots and reconnects
within the mounted controller do not replay notifications. A page reload starts a fresh session.

Normal toasts last 3.5 seconds, actionable offers 6 seconds, with 220 ms entry/exit.
One toast is visible, with up to six pending messages. Incoming offers take priority and interrupt
ordinary messages. Sounds/haptics fire once when a toast is shown. Pending offers retain a navigation
badge after dismissal. The toast's measured height reserves temporary header space, also while scrolling.
While visible, content is clipped below the toast so it cannot slide underneath it. The player's sticky
header and all navigation remain visible; ordinary document scrolling and the previous layout return
when the toast disappears.

Existing AudioManager handles unlock, decoding, variants, volume and local settings.
Mobile effects use SFX settings; hapticsEnabled is stored in the same valenor:audio-settings:v1 record.
Haptics use feature detection and are optional. Unsupported or blocked audio/vibration never blocks UI.
Music retains the existing output-role behavior: the primary screen provides background music.

## Optional recordings

Put additional recordings into apps/client/public/assets/audio/sfx/mobile/:

| Filename | Existing fallback |
| --- | --- |
| turn.ogg | ui/confirm.ogg |
| trade-offer.ogg | world/realm-transition-01.ogg |
| trade-accepted.ogg | events/event-positive-01.ogg |
| trade-rejected.ogg | events/event-negative-01.ogg |
| purchase.ogg | property/property-buy.ogg |
| build.ogg | ui/confirm.ogg |
| coin.ogg | economy/coins-gain-01.ogg, coins-gain-02.ogg |
| adventure.ogg | cards/card-draw-01.ogg |
| fate.ogg | cards/card-draw-02.ogg |
| double.ogg | events/event-positive-02.ogg |

The central mapping is audio/audio-config.ts. A valid optional recording takes precedence;
missing or invalid recordings use installed assets, or silence if those are also missing.
Reload after adding files because decoding results are cached. Mobile volume is 0.18–0.30 before
the user's master/SFX gains; playback caps range from 0.4 to 1 second, with a short fade at the end.
No extra recordings or libraries are required.
