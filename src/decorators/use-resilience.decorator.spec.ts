import { CircuitBreakerStrategy, RetryStrategy, TimeoutStrategy } from '../strategies';
import { UseResilience } from './use-resilience.decorator';
import { FixedBackoff } from '../helpers';

const timeoutStrategy = new TimeoutStrategy(100);
const retryStrategy = new RetryStrategy({
	maxRetries: 3,
	backoff: FixedBackoff
});

class UserService {
	@UseResilience(timeoutStrategy)
	async getUser(id: string) {
		return { id, name: 'John Doe' };
	}

	private usersCalls = 0;

	@UseResilience(timeoutStrategy, retryStrategy)
	async getUsers() {
		if (this.usersCalls === 0) {
			this.usersCalls++;
			throw new Error('Error');
		}

		if (this.usersCalls === 1) {
			this.usersCalls++;

			setTimeout(() => {
				Promise.resolve();
			}, 1000);
		}

		return [{ id: '1', name: 'John Doe' }];
	}

	async queryUser(id: string) {
		return { id, name: 'John Doe' };
	}

	@UseResilience(
		new CircuitBreakerStrategy({
			requestVolumeThreshold: 3,
			rollingWindowInMilliseconds: 1000
		})
	)
	async getUserCircuitStrategy(id: string) {
		return await this.queryUser(id);
	}
}

describe('UseResilience decorator', () => {
	let userService: UserService;

	beforeEach(async () => {
		userService = new UserService();

		await jest.advanceTimersByTimeAsync(10_000);
		jest.restoreAllMocks();
	});

	it('should be able to execute a command', async () => {
		const value = await userService.getUser('1');

		expect(value).toEqual({
			id: '1',
			name: 'John Doe'
		});
	});

	it('should be able get error', done => {
		userService.getUsers().then(value => {
			expect(value).toEqual([{ id: '1', name: 'John Doe' }]);
			done();
		});
	});

	it('should open the circuit and throw a circuit opened error', async () => {
		jest.spyOn(userService, 'queryUser').mockRejectedValue(new Error('err'));

		// Execute multiple calls to trigger circuit opening
		await expect(async () => await userService.getUserCircuitStrategy('1')).rejects.toThrow(
			new Error('err')
		); // 1st call. 20% failures
		await expect(async () => await userService.getUserCircuitStrategy('1')).rejects.toThrow(
			new Error('err')
		); // 2nd call. 40% failures
		await expect(async () => await userService.getUserCircuitStrategy('1')).rejects.toThrow(
			new Error('err')
		); // 3rd call. 60% failures

		// Circuit should be open now, expect circuit opened error
		await expect(async () => await userService.getUserCircuitStrategy('1')).rejects.toThrow(
			new Error('Circuit is open')
		);
	});
});
