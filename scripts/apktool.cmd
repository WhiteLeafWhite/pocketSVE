@echo off
"%~dp0..\.tools\java\jdk-21.0.12.1+1\bin\java.exe" -jar "%~dp0..\.tools\downloads\apktool_3.0.3.jar" %*
exit /b %errorlevel%
