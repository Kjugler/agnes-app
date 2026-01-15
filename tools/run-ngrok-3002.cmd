@echo off
setlocal
echo.
echo ================================================================================
echo NGROK TUNNEL - Port 3002 (agnes-next)
echo ================================================================================
echo.
echo Starting ngrok tunnel...
echo.
echo IMPORTANT: Copy the forwarding URL below and update:
echo   1. Stripe Dashboard -^> Developers -^> Webhooks -^> Endpoint URL
echo   2. Set webhook URL to: https://YOUR-NGROK-URL/api/stripe/webhook
echo.
echo The ngrok URL will appear below once ngrok starts.
echo.
echo Press Ctrl+C to stop ngrok.
echo ================================================================================
echo.
ngrok http 3002 --host-header=rewrite
echo.
echo Ngrok stopped. Press any key to close.
pause
endlocal

