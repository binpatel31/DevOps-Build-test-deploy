#!/bin/bash

# Exit on error
set -e

# Trace commands as we run them:
set -x

# Script used to initialize your ansible server after provisioning.
sudo add-apt-repository ppa:ansible/ansible -y
sudo apt-get update
sudo apt-get install ansible -y
sudo cp /bakerx/.vault-pass ~/
sudo chmod 600 ~/.vault-pass
sudo chmod 600 ~/.ssh/authorized_keys

