import string
import random
import json
import requests
from sys import exit

def getSerial():
    cpuserial = "0000000000000000"
    try:
        with open('/proc/cpuinfo','r') as fh:
            for line in fh:
                if line[0:6]=='Serial':
                    cpuserial = line[10:26]
    except:
        cpuserial = "ERROR000000000"
    return cpuserial

def selfProvision(url):
    def randStr(n):
        return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(n))

    name = "cam_" + randStr(10)

    provtok = None
    with open('provisioning_token.json','r') as ptfh:
        provtok = json.load(ptfh)

    reqdata = {
        'serial_number': getSerial(),
        'provtok': provtok,
        'name': name,
    }
    res = requests.post(url + '/' + name, reqdata)
    if res.status_code == 200:
        resdata = res.json()
        return resdata
    return None


def loadCredentials(fn):
    try:
        with open(fn,'r') as fh:
            creds = json.load(fh)
            return creds
    except Exception as e:
        print('Problem loading credentials')
        print(e)
        try:
            creds = selfProvision(url_base + '/setup')
            if creds:
                with open(fn,'w') as fh:
                    fh.write(json.dumps(creds))
                return creds
            else:
                print('Could not self-provision. Exiting.')
                exit(-1)
        except Exception as f:
            print('Self provisioning failed.')
            print(f)
            exit(-2)



