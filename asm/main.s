.include "defs.s"
.include "ram.s"


;Takes 56 cycles total
.macro play_sample
    ;Load fractional counter
    ld h, b ;4 cycles
    ld l, c ;4 cycles
    ;Add phase increment
    add hl, de ;11 cycles
    ;Save value back
    ld b, h ;4 cycles
    ld c, l ;4 cycles

    ;Transfer sample number to L
    ld l, h ;4 cycles
    ;Load H with the page number
    ld h, #0xC1 ;7 cycle

    ;Read sample value
    ld a, (HL) ;7 cycles
    out (PSG.WRITE), a ;11 cycles
.endm

.macro wait_16
    nop
    nop
    nop
    nop
.endm

.macro wait_172
    wait_16
    wait_16
    wait_16
    wait_16

    wait_16
    wait_16
    wait_16
    wait_16

    wait_16
    wait_16
    nop
    nop
    nop
.endm


.macro vblank_byte_transfer, ?skip
    jp z, skip ;10 cycles
    outi ;16 cycles
    skip:
.endm

.macro vblank_transfer
    ld hl, (cmds_currnt_ptr) ;16 cycles
    ld c, (hl)  ;7 cycles
    inc hl ;6 cycles

    ;First preamble byte
    ld a, (hl) ;7 cycles
    out (c), a ;12 cycles
    inc hl ;6 cycles

    ;Second preamble byte
    ld a, (hl) ;7 cycles
    out (c), a ;12 cycles
    inc hl ;6 cycles

    ;Load data I/O port
    ld c, (hl) ;7 cycles
    inc hl ;6 cycles

    ;Load byte transfer count
    ld b, (hl) ;7 cycles
    ;ld (hl), #0 ;10 cycles
    inc hl ;6 cycles

    ld e, (hl) ;7 cycles
    inc hl ;6 cycles
    ld d, (hl) ;7 cycles
    inc hl ;6 cycles

    ld (cmds_currnt_ptr), hl ;16 cycles
    ld h, d ;4 cycles
    ld l, e ;4 cycles

    ld a, #0 ;7 cycles
    or b ;4 cycles

    ;176 cycles up to this point

    .rept 8
        vblank_byte_transfer ;26 cycles per
    .endm

    ;56 cycles for PCM playback
    ;176 cycles of transfer logic
    ;26 * 8 = 208 cycles of actual transfer

    nop
    nop
.endm

.module main

.area main (ABS)
.org 0x00

di
im 1
jp main

.org 0x38
irq:
    ex af, af' ;4 cycles
    in a, (VDP.CONTROL) ;11 cycles
    or a ;4 cycles
    jp m, vblank ;12 cycles
    jp scanline ;10 cycles

.org 0x66
    ei
    retn

scanline:
    exx ;4 cycles

    play_sample

    exx ;4 cycles
    ex af, af' ;4 cycles
    ei ;4 cycles
    reti ;14 cycles

vblank:
    push bc
    push de
    push hl
    nop
    nop
    nop

    .rept 34
        exx
        play_sample
        exx
        vblank_transfer
    .endm

    ld hl, (cmds_table_ptr)
    ld (cmds_currnt_ptr), hl

    ex af, af'
    pop hl
    pop de
    pop bc
    ei
    reti

check_pitch_up:
    in a, (IO.PORTA)
    ld b, a
    and #1
    jr nz, 1$

    ld a, (up_pressed)
    or a
    ret nz

    scf
    ccf

    exx
    ld (tmp_16), de
    exx
    ld de, (tmp_16)

    ld a, e
    adc a, #10
    ld e, a

    ld a, d
    adc a, #0
    ld d, a

    ld (tmp_16), de
    exx
    ld de, (tmp_16)
    exx

    ld a, #1
    ld (up_pressed), a

    ret

    1$:
        ld a, #0
        ld (up_pressed), a
        ret

check_pitch_down:
    in a, (IO.PORTA)
    ld b, a
    and #2
    jr nz, 1$

    ld a, (down_pressed)
    or a
    ret nz

    scf

    exx
    ld (tmp_16), de
    exx
    ld de, (tmp_16)

    ld a, e
    sbc a, #10
    ld e, a

    ld a, d
    sbc a, #0
    ld d, a

    ld (tmp_16), de
    exx
    ld de, (tmp_16)
    exx

    ld a, #1
    ld (down_pressed), a

    ret

    1$:
        ld a, #0
        ld (down_pressed), a
        ret

check_mute:
    in a, (IO.PORTA)
    ld b, a
    and #32
    jr nz, 1$

    ei
    ret

    1$:
        di
        ret

    
main:
    ld hl, #0xC001

    ld c, #255
    ld b, #32

    ;Clear RAM
    1$:
        2$: 
            ld a, #0
            ld (hl), a
            inc hl
            dec c
            or c
            jr nz, 2$


        dec b
        ld a, #0
        or b
        jr nz, 1$

    ;Write wavetable to RAM
    ld c, #0b10010000
    ld b, #128

    ld hl, #wavetable

    3$:
        ld (hl), c
        ;inc c
        inc hl
        djnz 3$

    ld c, #0b10011111
    ld b, #128
    4$:
        ld (hl), c
        ;inc c
        inc hl
        djnz 4$

    ld hl, #vdp_commands
    ld (cmds_table_ptr), hl

    ;Set 
    ld a, #0b10000000
    out (PSG.WRITE), a
    ld a, #0
    out (PSG.WRITE), a
    ;Set 
    ld a, #0b10010000
    out (PSG.WRITE), a

    exx
    ld hl, #0xc100
    ld c, #PSG.WRITE
    ld de, #600
    exx

    ;Register 0
    ld a, #0b00110100
    out (VDP.CONTROL), a
    ld a, #0b10000000
    out (VDP.CONTROL), a

    ;Register 1
    ld a, #0b01100000
    out (VDP.CONTROL), a
    ld a, #0b10000001
    out (VDP.CONTROL), a

    ;Register 10
    ld a, #1
    out (VDP.CONTROL), a
    ld a, #0b10001010
    out (VDP.CONTROL), a

    ld hl, #vdp_commands
    ld (cmds_currnt_ptr), hl

    ei

    loop:
        call check_pitch_up
        call check_pitch_down
        ;call check_mute
        jp loop

vdp_commands:
    .db 0xC0, #0b10000000, 3
    .db 0xC0, 16, 0x00, 0xC0

vdp_commands_2:
    .db 0xC0, #0b10000000, 3
    .db 0xC0, 16, 0x00, 0xD0
