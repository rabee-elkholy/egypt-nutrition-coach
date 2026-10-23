"""Supply a temporary Sites credential on hidden stdin; never persist it."""
import sys,json,os,subprocess,termios
fd=sys.stdin.fileno(); old=termios.tcgetattr(fd);new=old[:];new[3]&=~termios.ECHO;termios.tcsetattr(fd,termios.TCSANOW,new)
print('Ready for credential on hidden stdin',flush=True)
try: c=json.loads(sys.stdin.readline())
finally: termios.tcsetattr(fd,termios.TCSANOW,old)
env=dict(os.environ)
if c.get('token'):
 env.update(GIT_CONFIG_COUNT='1',GIT_CONFIG_KEY_0='http.extraHeader',GIT_CONFIG_VALUE_0='Authorization: Bearer '+c['token'])
subprocess.run(['git','push',c['remote_url'],'HEAD:refs/heads/'+c['branch']],env=env,check=True)
