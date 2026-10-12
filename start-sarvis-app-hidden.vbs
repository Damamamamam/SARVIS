Set shell = CreateObject("WScript.Shell")
root = Replace(WScript.ScriptFullName, "start-sarvis-app-hidden.vbs", "")
shell.CurrentDirectory = root
shell.Run "cmd.exe /c """ & root & "start-sarvis-app.bat""" , 0, False
