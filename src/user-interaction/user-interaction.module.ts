import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserInteractionController } from './user-interaction.controller';
import {
  UserInteraction,
  UserInteractionSchema,
} from './user-interaction.schema';
import { UserInteractionService } from './user-interaction.service';
import { User, UserSchema } from 'src/users/user.schema';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserInteraction.name, schema: UserInteractionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => UsersModule),
  ],
  controllers: [UserInteractionController],
  providers: [UserInteractionService],
  exports: [UserInteractionService],
})
export class UserInteractionModule {}
