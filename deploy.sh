#! /bin/bash

CYAN="\e[0;36m"
RED="\e[0;31m"
GREEN="\e[0;32m"
STD="\e[m"

ACTUAL_STEP="0"
RESUME_STEP="0"
if [ "$#" -ge "1" ] && [[ $1 =~ ^[0-9]+$ ]]; then
    RESUME_STEP="$1"
fi

run_cmd() {
    if [ $ACTUAL_STEP -lt $RESUME_STEP ]; then
        printf "${CYAN}Skiping: '$1'${STD}\n"
    else
        printf "${CYAN}Run: '$1' ${STD}\n"
        sh -c "$1"
        RET="$?"
        if [ $RET != "0" ] && [ "$2" == "" ]; then
            printf "${RED}Command: '$1' failed..${STD}\n"
            printf "${RED}To resume deploy from this step, execute '$0 $ACTUAL_STEP'${STD}\n"
            exit 1
        elif [ $RET != "0" ]; then
            printf "${RED}Command: '$1' failed..${STD}\n"
            printf "${CYAN}Will run '$2' and retry${STD}\n"
            sh -c "$2"
            printf "${CYAN}Run: '$1' ${STD}\n"
            sh -c "$1"
            if [ $? != 0 ]; then
                printf "${RED}Command: '$1' failed..${STD}\n"
                printf "${RED}To resume deploy from this step, execute '$0 $ACTUAL_STEP'${STD}\n"
                exit 1
            fi
        fi
    fi
    ACTUAL_STEP=$((ACTUAL_STEP+1))
}

printf "${GREEN}Start deployment, we may ask your sudo password${STD}\n"
SUDO_LINE="`whoami` ALL=(ALL:ALL) NOPASSWD:ALL"
ACTUAL_SUDO=$(sudo cat /etc/sudoers | grep "$SUDO_LINE")
if [[ "$ACTUAL_SUDO" == "" ]]; then
    run_cmd "sudo sh -c \"echo \\\"$SUDO_LINE\\\" >> /etc/sudoers\""
fi

run_cmd "sudo snap install conjure-up --classic"
run_cmd "sudo snap install lxd"
run_cmd "/snap/bin/lxd init --preseed < ./parts/lxd/config/init-preseed.yaml" "sudo chmod o+rw /var/snap/lxd/common/lxd/unix.socket"
run_cmd "conjure-up kubernetes-core localhost"
run_cmd "juju deploy cs:~hazmat/trusty/kafka-1"
run_cmd "juju deploy cs:~hazmat/trusty/zookeeper-0"
run_cmd "juju add-relation kafka zookeeper"
run_cmd "juju deploy cs:mongodb-48"
run_cmd "juju deploy cs:neo4j-0"
printf "${GREEN}Deployment succeed, see 'juju status'${STD}\n"