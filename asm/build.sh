sdasz80 -o main.s
sdld -b RAM=0xC000 -i main.rel
objcopy -I ihex -O binary main.ihx main.sms
rm *.rel
rm *.ihx
