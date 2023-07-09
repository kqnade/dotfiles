#!/bin/bash

function mask_value {
  local value="$1"
  local length="${#value}"
  printf "%*s" "$length" | tr ' ' '*'
}
echo ""
echo ""
echo "██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗    ██╗    ██╗██╗███████╗ █████╗ ██████╗ ██████╗     ██╗   ██╗ ██╗    ██████╗ "
echo "██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝    ██║    ██║██║╚══███╔╝██╔══██╗██╔══██╗██╔══██╗    ██║   ██║███║   ██╔═████╗"
echo "██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝     ██║ █╗ ██║██║  ███╔╝ ███████║██████╔╝██║  ██║    ██║   ██║╚██║   ██║██╔██║"
echo "██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝      ██║███╗██║██║ ███╔╝  ██╔══██║██╔══██╗██║  ██║    ╚██╗ ██╔╝ ██║   ████╔╝██║"
echo "██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║       ╚███╔███╔╝██║███████╗██║  ██║██║  ██║██████╔╝     ╚████╔╝  ██║██╗╚██████╔╝"
echo "╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝        ╚══╝╚══╝ ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝       ╚═══╝   ╚═╝╚═╝ ╚═════╝ "
echo ""
echo "Made by k4nade(https://github.com/kqnade)"
echo "                                       "

while true; do
  echo "==================================================="
  echo "|     1: Check Settings                           |"
  echo "|     2: Set Proxy (manual settings)              |"
  echo "|     3: Set Proxy (preset for NITKC)             |"
  echo "|     4: Remove Settings                          |"
  echo "|     5: Exit                                     |"
  echo "==================================================="
  read -p "Please type number of action: " actionnum
  echo "                                       "

  case $actionnum in
    1)
      echo "------------ Proxy Configurate Checker ------------"
      echo "    Proxy Path    :  $proxy_path"
      echo "  Proxy Username  :  $proxy_username"
      echo "  Proxy Password  :  $(mask_value $proxy_password)"
      echo "---------------------------------------------------"
      echo ""
      echo ""
      ;;
    2)
      echo "---------------- Proxy Setup Agent ----------------"
      read -p "Proxy path and port number (ex. 157.114.16.93:8080): " proxy_path
      read -p "username: " proxy_username
      read -sp "$proxy_username's Password: " proxy_password
      export http_proxy="http://${proxy_username}:${proxy_password}@${proxy_path}"
      export https_proxy="http://${proxy_username}:${proxy_password}@${proxy_path}"
      git config --global http.proxy http://${proxy_username}:${proxy_password}@${proxy_path}
      echo ""
      echo "Success proxy configuration."
      echo ""
      echo "---------------------------------------------------"
      echo ""
      echo ""
      ;;
    3)
      # nitkc proxy script created by arumino
      echo "------------- NITKC Proxy Setup Agent -------------"
      read -p "Your student number? (ex. p2200xx): " proxy_username
      read -sp "Your password?: " proxy_password
      export proxy_path="157.114.16.93:8080"
      export http_proxy="http://${proxy_username}:${proxy_password}@${proxy_path}"
      export https_proxy="http://${proxy_username}:${proxy_password}@${proxy_path}"
      git config --global http.proxy http://${proxy_username}:${proxy_password}@${proxy_path}
      echo ""
      echo "Success proxy configuration."
      echo ""
      echo "---------------------------------------------------"
      echo ""
      echo ""
      ;;
    4)
      echo "------------ Proxy Configurate Remover ------------"
      echo "You want to remove proxy configuration, press enter key. q to exit "
      read -n 1 key
      if [ "$key" = "" ]; then
        echo "OK! Now, will delete proxy settings!"
        unset proxy_path
        unset proxy_username
        unset proxy_password
        unset http_proxy
        unset https_proxy
        git config --global --unset http.proxy
        echo ""
        echo "Complete!"
        echo "After removing the proxy settings, the proxy settings may still be present in the previously cloned repositories. In that case, please execute the following command in each repository to remove the proxy settings."
        echo "git config --unset http.proxy"
        echo ""
        echo ""
      else
        echo ""
        echo "exit."
        echo ""
        echo ""
      fi
      ;;
    *)
      break
      ;;
  esac
done 

echo "Thank you for your using!"
echo "Will clear log after 3 sec.."
echo "If you don't want to clear, You exit with Ctrl+C!"
sleep 3
clear
