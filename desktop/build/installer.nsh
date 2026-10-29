; Zusätze zum Installations-Assistenten (electron-builder, NSIS).
; Die Firewall-Regel erlaubt eingehende Verbindungen nur in privaten Netzwerken, damit Handys im Heim-WLAN beitreten
; können. Der Assistent läuft mit Administratorrechten (perMachine), sonst darf netsh keine Regel anlegen.

!macro customInstall
  ; Alte Regel (z. B. von einer früheren Version) zuerst entfernen, damit keine doppelten Einträge entstehen.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Chroniken von Valenor"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Chroniken von Valenor" description="Erlaubt Handys im selben WLAN, dem Spiel beizutreten." dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=TCP profile=private enable=yes'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Chroniken von Valenor"'
!macroend
