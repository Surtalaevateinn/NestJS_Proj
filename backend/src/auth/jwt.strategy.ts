import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: 'SECRET_KEY_DONT_USE_IN_PROD', // Consistent with AuthModule
        });
    }

    // The payload is decrypted from the JWT.
    async validate(payload: any) {
        // The returned content will be attached to the Request object, i.e., req.user.
        // Includes email and sub (user ID)
        return { userId: payload.sub, email: payload.email };
    }
}