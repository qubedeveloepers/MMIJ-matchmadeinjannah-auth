import { UsersService } from './users.service';
import { UserSchema } from './user.schema';
import { UserStatus } from './enums/userStatus.enum';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: { deleteOne: jest.Mock };
  let exec: jest.Mock;

  beforeEach(() => {
    exec = jest.fn();
    userModel = {
      deleteOne: jest.fn().mockReturnValue({ exec }),
    };

    service = new UsersService(
      userModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as any,
    );
  });

  it('deletes only the requested pending user', async () => {
    exec.mockResolvedValueOnce({ deletedCount: 1 });

    await expect(
      service.deletePendingUserById('pending-user-id'),
    ).resolves.toBe(true);

    expect(userModel.deleteOne).toHaveBeenCalledWith({
      _id: 'pending-user-id',
      status: UserStatus.PENDING,
    });
  });

  it('does not delete a user that is no longer pending', async () => {
    exec.mockResolvedValueOnce({ deletedCount: 0 });

    await expect(
      service.deletePendingUserById('active-user-id'),
    ).resolves.toBe(false);
  });

  it('keeps database uniqueness guards on registration fields', () => {
    expect(UserSchema.path('email').options.unique).toBeTruthy();
    expect(UserSchema.path('username').options.unique).toBeTruthy();
    expect(UserSchema.path('mobilePhone').options.unique).toBeTruthy();
    expect(UserSchema.path('mobilePhone').options.sparse).toBe(true);
  });
});
