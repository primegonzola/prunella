#!/usr/bin/env python
# source https://msftstack.wordpress.com/2017/05/10/figuring-out-azure-vm-scale-set-machine-names/ 
"""calculates the instance id from hostname"""
import sys


def hostname_to_instance_id(hostname):
    '''hostname_to_instance_id'''
    # get last 6 characters and remove leading zeroes
    hexatrig = hostname[-6:].lstrip('0')
    multiplier = 1
    vmid = 0
    # reverse string and process each char
    for xee in hexatrig[::-1]:
        if xee.isdigit():
            vmid += int(xee) * multiplier
        else:
            # convert letter to corresponding integer
            vmid += (ord(xee) - 55) * multiplier
        multiplier *= 36
    return vmid

def instance_id_to_hostname(prefix, instance_id):
    hexatrig = ''
    # convert decimal vmid to hexatrigesimal base36
    while instance_id > 0:
        vmid_mod = instance_id % 36
        # convert int to corresponding letter
        if vmid_mod > 9:
            char = chr(vmid_mod + 55)
        else:
            char = str(vmid_mod)
        hexatrig = char + hexatrig
        instance_id = int(instance_id/36) 
    return prefix + hexatrig.zfill(6)

# Standard boilerplate
if __name__ == '__main__':
        if sys.argv[1] == 'h2i' :
            print (hostname_to_instance_id(sys.argv[2]))
        if sys.argv[1] == 'i2h' :
            print (instance_id_to_hostname(sys.argv[2], int(sys.argv[3])))

